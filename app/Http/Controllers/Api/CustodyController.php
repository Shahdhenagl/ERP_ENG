<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Asset;
use App\Models\AssetCustody;
use App\Models\CashBox;
use App\Models\User;
use App\Services\CustodyService;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustodyController extends Controller
{
    public function __construct(protected CustodyService $custody) {}

    /** Every technician and what they are holding. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->custody->allStatements()]);
    }

    /** One technician, with the movements and expenses behind their custody. */
    public function show(Request $request, User $user): JsonResponse
    {
        // An optional YYYY-MM narrows the expenses to one month for the printed
        // statement; the cash, stock and devices are always the position today.
        $month = $request->string('month')->toString() ?: null;

        return response()->json([
            'data' => [
                ...$this->custody->statementFor($user),
                'shortfall' => $this->custody->shortfallFor($user),
                'stock_history' => $this->custody->stockHistoryFor($user),
                'expenses' => $this->custody->expensesFor($user, $month),
                'month' => $month,
            ],
        ]);
    }

    /* ── The technician's own custody (self-serve) ───────── */

    /** The signed-in technician's own custody, its ledger and recent expenses. */
    public function mine(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => $this->mineData($user)]);
    }

    /**
     * The technician records something they paid for out of their own float —
     * optionally against a job. They may spend past their balance; the float
     * simply goes negative and the difference becomes owed to them.
     */
    public function spendMine(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'category' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:1000'],
            'task_id' => ['nullable', 'exists:tasks,id'],
            'receipt' => ['nullable', 'file', 'image', 'max:8192'],
        ]);

        $user = $request->user();

        // A technician may only bill a job that is theirs.
        if (! empty($data['task_id'])) {
            $owned = \App\Models\Task::whereKey($data['task_id'])
                ->whereHas('technicians', fn ($q) => $q->where('users.id', $user->id))
                ->exists();
            abort_if($user->isTechnician() && ! $owned, 403, 'هذه المهمة غير مسندة إليك.');
        }

        $data['receipt_path'] = $this->storeReceipt($request);

        $this->custody->spendFromCustody($user, (float) $data['amount'], $user, $data);

        return response()->json(['data' => $this->mineData($user)], 201);
    }

    /** @return array<string, mixed> */
    protected function mineData(User $user): array
    {
        return [
            ...$this->custody->statementFor($user),
            'shortfall' => $this->custody->shortfallFor($user),
            'ledger' => $this->custody->ledgerFor($user),
            'expenses' => $this->custody->expensesFor($user),
        ];
    }

    /* ── Money ───────────────────────────────────────────── */

    public function cash(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'cash_box_id' => ['required', 'exists:cash_boxes,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'direction' => ['required', 'in:advance,return'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $technician = User::findOrFail($data['user_id']);
        $box = CashBox::findOrFail($data['cash_box_id']);
        $amount = (float) $data['amount'];

        if ($data['direction'] === 'advance') {
            $this->custody->advanceCash($technician, $amount, $box, $request->user(), $data['note'] ?? null);
        } else {
            $this->custody->returnCash($technician, $amount, $box, $request->user(), $data['note'] ?? null);
        }

        ActivityLog::record(
            'custody.cash',
            $technician,
            ($data['direction'] === 'advance' ? 'صرف عهدة نقدية لـ ' : 'رد عهدة نقدية من ')
                .$technician->name.' بمبلغ '.number_format($amount, 2),
        );

        return response()->json(['data' => $this->custody->statementFor($technician)], 201);
    }

    /** Something the technician paid for out of their own float. */
    public function spend(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'category' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:1000'],
            'receipt' => ['nullable', 'file', 'image', 'max:8192'],
        ]);

        $technician = User::findOrFail($data['user_id']);
        $data['receipt_path'] = $this->storeReceipt($request);

        $this->custody->spendFromCustody($technician, (float) $data['amount'], $request->user(), $data);

        return response()->json(['data' => $this->custody->statementFor($technician)], 201);
    }

    /** Pay a technician the difference they fronted — real money out of a box. */
    public function settle(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'cash_box_id' => ['required', 'exists:cash_boxes,id'],
        ]);

        $technician = User::findOrFail($data['user_id']);
        $amount = $this->custody->settleShortfall(
            $technician,
            CashBox::findOrFail($data['cash_box_id']),
            $request->user(),
        );

        ActivityLog::record(
            'custody.settled',
            $technician,
            "صرف فرق العهدة لـ {$technician->name} بمبلغ ".number_format($amount, 2),
        );

        return response()->json(['data' => $this->custody->statementFor($technician)]);
    }

    /** Write the difference off — the technician bears it, no cash paid. */
    public function waive(Request $request): JsonResponse
    {
        $data = $request->validate(['user_id' => ['required', 'exists:users,id']]);

        $technician = User::findOrFail($data['user_id']);
        $amount = $this->custody->waiveShortfall($technician, $request->user());

        ActivityLog::record(
            'custody.waived',
            $technician,
            "تجاوز فرق عهدة {$technician->name} بمبلغ ".number_format($amount, 2),
        );

        return response()->json(['data' => $this->custody->statementFor($technician)]);
    }

    /** Save an uploaded receipt photo to the public disk, if one was sent. */
    protected function storeReceipt(Request $request): ?string
    {
        return $request->hasFile('receipt')
            ? $request->file('receipt')->store('receipts', 'public')
            : null;
    }

    /* ── Devices ─────────────────────────────────────────── */

    public function takeDevice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'asset_id' => ['required', 'exists:assets,id'],
            'user_id' => ['required', 'exists:users,id'],
            'reason' => ['nullable', 'in:workshop_repair,installation,inspection,other'],
            'taken_from' => ['nullable', 'string', 'max:160'],
            'task_id' => ['nullable', 'exists:tasks,id'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $asset = Asset::findOrFail($data['asset_id']);
        $technician = User::findOrFail($data['user_id']);

        $custody = $this->custody->takeDevice($asset, $technician, $request->user(), $data);

        ActivityLog::record(
            'custody.device_taken',
            $asset,
            "{$asset->label()} في عهدة {$technician->name}",
        );

        return response()->json(['data' => ['id' => $custody->id]], 201);
    }

    public function returnDevice(Request $request, AssetCustody $custody): JsonResponse
    {
        $data = $request->validate([
            'returned_to' => ['nullable', 'string', 'max:160'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $this->custody->returnDevice($custody, $request->user(), $data);

        ActivityLog::record(
            'custody.device_returned',
            $custody->asset,
            "تم تسليم {$custody->asset?->label()} من عهدة {$custody->holder?->name}",
        );

        return response()->json(['message' => Terms::get('تم تسجيل التسليم.')]);
    }

    /** Devices currently out, whoever is holding them. */
    public function devices(Request $request): JsonResponse
    {
        $rows = AssetCustody::query()
            ->when(! $request->boolean('include_returned'), fn ($q) => $q->open())
            ->when($request->integer('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->with(['asset.customer', 'holder', 'task'])
            ->latest('id')
            ->limit($request->integer('per_page', 50))
            ->get()
            ->map(fn (AssetCustody $custody) => [
                'id' => $custody->id,
                'asset_id' => $custody->asset_id,
                'asset' => $custody->asset?->label(),
                'serial' => $custody->asset?->serial,
                'customer' => $custody->asset?->customer?->name,
                'holder' => $custody->holder?->name,
                'holder_id' => $custody->user_id,
                'reason' => $custody->reason,
                'reason_label' => $custody->reasonLabel(),
                'taken_from' => $custody->taken_from,
                'taken_at' => $custody->taken_at?->toIso8601String(),
                'returned_at' => $custody->returned_at?->toIso8601String(),
                'returned_to' => $custody->returned_to,
                'days_held' => $custody->daysHeld(),
                'task_code' => $custody->task?->code,
                'note' => $custody->note,
            ]);

        return response()->json(['data' => $rows]);
    }
}
