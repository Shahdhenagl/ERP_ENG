<?php

namespace App\Http\Controllers\Api;

use App\Enums\ContractStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\ContractResource;
use App\Models\ActivityLog;
use App\Models\Asset;
use App\Models\Contract;
use App\Services\MaintenancePlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ContractController extends Controller
{
    public function __construct(protected MaintenancePlanner $planner) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $contracts = Contract::query()
            ->search($request->string('search')->toString())
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->when($request->boolean('expiring'), fn ($q) => $q->expiringWithin(60))
            ->with('customer')
            ->withCount(['assets', 'visits'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 25));

        return ContractResource::collection($contracts);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $assetIds = $this->pullAssetIds($data);

        $this->assertNoOverlap($data['customer_id'], $data['starts_on'], $data['ends_on']);
        $this->assertAssetsBelongToCustomer($assetIds, (int) $data['customer_id']);

        $data['created_by'] = $request->user()->id;

        $contract = Contract::create($data);
        $contract->assets()->sync($assetIds);

        ActivityLog::record('contract.created', $contract, "تم إنشاء عقد الصيانة {$contract->code}");

        // A contract created as active is planned straight away — otherwise the
        // manager would have to activate something that is already live.
        if ($contract->status === ContractStatus::Active) {
            $this->planner->plan($contract);
            $this->planner->materialiseDueVisits();
        }

        return response()->json(new ContractResource($this->loaded($contract)), 201);
    }

    public function show(Contract $contract): ContractResource
    {
        return new ContractResource($this->loaded($contract));
    }

    public function update(Request $request, Contract $contract): ContractResource
    {
        $data = $this->validated($request, $contract);
        $assetIds = $this->pullAssetIds($data);

        $this->assertNoOverlap($data['customer_id'], $data['starts_on'], $data['ends_on'], $contract->id);
        $this->assertAssetsBelongToCustomer($assetIds, (int) $data['customer_id']);

        // Only these three change what the plan should look like. Editing the
        // title or the notes should not disturb dates a customer was told.
        $termChanged = $contract->starts_on->toDateString() !== $data['starts_on']
            || $contract->ends_on->toDateString() !== $data['ends_on']
            || (int) $contract->visits_per_year !== (int) $data['visits_per_year'];

        $contract->update($data);
        $contract->assets()->sync($assetIds);

        ActivityLog::record('contract.updated', $contract, "تم تعديل عقد الصيانة {$contract->code}");

        if ($contract->status === ContractStatus::Active && $termChanged) {
            $this->planner->plan($contract);
            $this->planner->materialiseDueVisits();
        }

        return new ContractResource($this->loaded($contract->fresh()));
    }

    public function destroy(Contract $contract): JsonResponse
    {
        // Work already under way outlives the paperwork. Cancel it explicitly
        // instead of letting a delete orphan live jobs.
        if ($contract->tasks()->open()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف عقد له مهام مفتوحة. ألغِ العقد بدلًا من ذلك.',
            ], 422);
        }

        $code = $contract->code;
        $this->planner->cancelPlanFor($contract);
        $contract->delete();

        ActivityLog::record('contract.deleted', $contract, "تم حذف عقد الصيانة {$code}");

        return response()->json(['message' => 'تم حذف العقد.']);
    }

    // ── Lifecycle ────────────────────────────────────────────

    /** Turn a draft into a live contract and lay out its visits. */
    public function activate(Contract $contract): ContractResource
    {
        if ($contract->status === ContractStatus::Cancelled) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن تفعيل عقد ملغي. أنشئ عقدًا جديدًا.',
            ]);
        }

        $contract->update(['status' => ContractStatus::Active]);

        $planned = $this->planner->plan($contract);
        $this->planner->materialiseDueVisits();

        ActivityLog::record(
            action: 'contract.activated',
            subject: $contract,
            description: "تم تفعيل عقد الصيانة {$contract->code} بـ {$planned} زيارة",
        );

        return new ContractResource($this->loaded($contract->fresh()));
    }

    public function cancel(Contract $contract): ContractResource
    {
        $contract->update(['status' => ContractStatus::Cancelled]);

        $released = $this->planner->cancelPlanFor($contract);

        ActivityLog::record(
            action: 'contract.cancelled',
            subject: $contract,
            description: "تم إلغاء عقد الصيانة {$contract->code} وإلغاء {$released} زيارة لم تبدأ",
        );

        return new ContractResource($this->loaded($contract->fresh()));
    }

    /**
     * Manual sweep. Materialisation normally rides on request traffic, which
     * is fine until nobody logs in for a week — this is the button that does
     * not depend on that.
     */
    public function materialise(Contract $contract): ContractResource
    {
        $this->planner->materialiseDueVisits();

        return new ContractResource($this->loaded($contract->fresh()));
    }

    // ── Helpers ──────────────────────────────────────────────

    protected function loaded(Contract $contract): Contract
    {
        return $contract->load([
            'customer',
            'assets',
            'visits.task.technician',
        ])->loadCount(['assets', 'visits']);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<int, int>
     */
    protected function pullAssetIds(array &$data): array
    {
        $ids = $data['asset_ids'] ?? [];
        unset($data['asset_ids']);

        return array_map('intval', $ids);
    }

    /**
     * Two live contracts over the same customer and dates would make "which
     * SLA applies" a coin toss. Reject it here so the resolver's tie-break
     * stays a safety net rather than a rule anyone depends on.
     */
    protected function assertNoOverlap(int $customerId, string $startsOn, string $endsOn, ?int $ignoreId = null): void
    {
        $clash = Contract::query()
            ->where('customer_id', $customerId)
            ->where('status', ContractStatus::Active->value)
            ->when($ignoreId, fn ($q, $id) => $q->whereKeyNot($id))
            ->whereDate('starts_on', '<=', $endsOn)
            ->whereDate('ends_on', '>=', $startsOn)
            ->first();

        if ($clash) {
            throw ValidationException::withMessages([
                'starts_on' => "يتعارض مع العقد {$clash->code} الساري في نفس الفترة.",
            ]);
        }
    }

    /** @param  array<int, int>  $assetIds */
    protected function assertAssetsBelongToCustomer(array $assetIds, int $customerId): void
    {
        if (! $assetIds) {
            return;
        }

        $foreign = Asset::query()
            ->whereIn('id', $assetIds)
            ->where('customer_id', '!=', $customerId)
            ->pluck('code');

        if ($foreign->isNotEmpty()) {
            throw ValidationException::withMessages([
                'asset_ids' => 'هذه الأجهزة لا تخص العميل: '.$foreign->implode('، '),
            ]);
        }
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?Contract $contract = null): array
    {
        return $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'title' => ['nullable', 'string', 'max:200'],

            'starts_on' => ['required', 'date'],
            'ends_on' => ['required', 'date', 'after:starts_on'],
            'visits_per_year' => ['required', 'integer', 'min:1', 'max:24'],

            'status' => ['nullable', Rule::enum(ContractStatus::class)],

            'value' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],

            'sla_response_hours' => ['nullable', 'integer', 'min:1', 'max:8760'],
            'sla_resolution_hours' => ['nullable', 'integer', 'min:1', 'max:8760'],

            'asset_ids' => ['nullable', 'array'],
            'asset_ids.*' => ['integer', 'exists:assets,id'],

            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
    }
}
