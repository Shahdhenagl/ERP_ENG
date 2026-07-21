<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Asset;
use App\Models\AssetCustody;
use App\Models\CashBox;
use App\Models\User;
use App\Services\CustodyService;
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

    /** One technician, with the movements behind their stock. */
    public function show(User $user): JsonResponse
    {
        return response()->json([
            'data' => [
                ...$this->custody->statementFor($user),
                'stock_history' => $this->custody->stockHistoryFor($user),
            ],
        ]);
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
        ]);

        $technician = User::findOrFail($data['user_id']);

        $this->custody->spendFromCustody($technician, (float) $data['amount'], $request->user(), $data);

        return response()->json(['data' => $this->custody->statementFor($technician)], 201);
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

        return response()->json(['message' => 'تم تسجيل التسليم.']);
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
