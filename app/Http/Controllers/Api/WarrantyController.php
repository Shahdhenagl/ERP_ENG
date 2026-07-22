<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AssetResource;
use App\Http\Resources\TaskResource;
use App\Http\Resources\WarrantyClaimResource;
use App\Http\Resources\WarrantyResource;
use App\Models\ActivityLog;
use App\Models\Asset;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Services\WarrantyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class WarrantyController extends Controller
{
    public function __construct(protected WarrantyService $warranty) {}

    /* ── Warranties ──────────────────────────────────────── */

    public function index(Request $request): AnonymousResourceCollection
    {
        $warranties = Warranty::query()
            ->when($request->integer('asset_id'), fn ($q, $id) => $q->where('asset_id', $id))
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->string('kind')->toString(), fn ($q, $kind) => $q->where('kind', $kind))
            // Expiry is derived, so filtering on it is a date window rather
            // than a status match.
            ->when($request->boolean('effective'), fn ($q) => $q->effective())
            ->when($request->integer('expiring_within'), fn ($q, $days) => $q->expiringWithin($days))
            ->when($request->string('search')->toString(), fn ($q, $term) => $q->where(
                fn ($w) => $w->where('code', 'like', "%{$term}%")
                    ->orWhereHas('asset', fn ($a) => $a->search($term))
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$term}%")),
            ))
            ->with(['asset', 'customer', 'supplier', 'invoice', 'parent'])
            ->withCount('claims')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return WarrantyResource::collection($warranties);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'asset_id' => ['required', 'exists:assets,id'],
            'kind' => ['nullable', 'in:company,supplier,extension'],
            'covers' => ['nullable', 'in:parts,labour,both'],
            'starts_on' => ['nullable', 'date'],
            // One or the other: an end date, or a term in months.
            'ends_on' => ['nullable', 'date'],
            'months' => ['nullable', 'integer', 'min:1', 'max:240'],
            'invoice_id' => ['nullable', 'exists:invoices,id'],
            'supplier_id' => ['nullable', 'exists:suppliers,id'],
            'supplier_reference' => ['nullable', 'string', 'max:64'],
            'terms' => ['nullable', 'string', 'max:4000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $warranty = $this->warranty->register($data, $request->user());

        ActivityLog::record('warranty.registered', $warranty, "تسجيل ضمان {$warranty->code}");

        // `->response()` rather than `response()->json($resource)`: the latter
        // serialises the resource without its `data` wrapper, so a created
        // record would come back shaped differently from a fetched one.
        return (new WarrantyResource($warranty->load(['asset', 'customer', 'supplier'])))
            ->response()->setStatusCode(201);
    }

    public function show(Warranty $warranty): WarrantyResource
    {
        return new WarrantyResource(
            $warranty->load(['asset.customer', 'customer', 'supplier', 'invoice', 'parent'])
                ->loadCount('claims'),
        );
    }

    public function update(Request $request, Warranty $warranty): WarrantyResource
    {
        // Dates are deliberately absent: moving them is what an extension or a
        // void is for, and editing them in place would erase what was promised.
        $data = $request->validate([
            'covers' => ['nullable', 'in:parts,labour,both'],
            'supplier_reference' => ['nullable', 'string', 'max:64'],
            'terms' => ['nullable', 'string', 'max:4000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $warranty->update($data);

        return new WarrantyResource($warranty->fresh(['asset', 'customer', 'supplier']));
    }

    /** Sell more time; a new record following the old one. */
    public function extend(Request $request, Warranty $warranty): JsonResponse
    {
        $data = $request->validate([
            'ends_on' => ['nullable', 'date'],
            'months' => ['nullable', 'integer', 'min:1', 'max:240'],
            'covers' => ['nullable', 'in:parts,labour,both'],
            'invoice_id' => ['nullable', 'exists:invoices,id'],
            'terms' => ['nullable', 'string', 'max:4000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $extension = $this->warranty->extend($warranty, $data, $request->user());

        ActivityLog::record(
            'warranty.extended',
            $extension,
            "تمديد الضمان {$warranty->code} حتى {$extension->ends_on->toDateString()}",
        );

        return (new WarrantyResource($extension->load(['asset', 'customer', 'parent'])))
            ->response()->setStatusCode(201);
    }

    public function void(Request $request, Warranty $warranty): WarrantyResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);

        $voided = $this->warranty->void($warranty, $data['reason'], $request->user());

        ActivityLog::record('warranty.voided', $voided, "إلغاء الضمان {$voided->code}");

        return new WarrantyResource($voided->load(['asset', 'customer']));
    }

    /** Everything on one unit — «تاريخ الجهاز». */
    public function history(Asset $asset): JsonResponse
    {
        $history = $this->warranty->history($asset);

        return response()->json([
            'asset' => new AssetResource($asset->load(['customer', 'branch'])),
            'cover' => $history['cover'] ? new WarrantyResource($history['cover']) : null,
            'warranties' => WarrantyResource::collection($history['warranties']),
            'claims' => WarrantyClaimResource::collection($history['claims']),
            'summary' => [
                'claims_open' => $history['claims_open'],
                'repairs' => $history['repairs'],
                'replacements' => $history['replacements'],
            ],
        ]);
    }

    /* ── Claims ──────────────────────────────────────────── */

    public function claims(Request $request): AnonymousResourceCollection
    {
        $claims = WarrantyClaim::query()
            ->when($request->integer('asset_id'), fn ($q, $id) => $q->where('asset_id', $id))
            ->when($request->integer('warranty_id'), fn ($q, $id) => $q->where('warranty_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('open'), fn ($q) => $q->whereIn('status', ['open', 'approved']))
            ->with(['warranty', 'asset.customer', 'task', 'replacement'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return WarrantyClaimResource::collection($claims);
    }

    public function storeClaim(Request $request): JsonResponse
    {
        $data = $request->validate([
            'asset_id' => ['required', 'exists:assets,id'],
            // The date the fault happened, which cover is judged against.
            'reported_on' => ['nullable', 'date'],
            'fault' => ['required', 'string', 'max:2000'],
        ]);

        $claim = $this->warranty->claim($data, $request->user());

        ActivityLog::record('warranty.claimed', $claim, "بلاغ ضمان {$claim->code}");

        return (new WarrantyClaimResource($claim->load(['warranty', 'asset.customer'])))
            ->response()->setStatusCode(201);
    }

    public function showClaim(WarrantyClaim $claim): WarrantyClaimResource
    {
        return new WarrantyClaimResource(
            $claim->load(['warranty.asset', 'asset.customer', 'task', 'replacement']),
        );
    }

    /**
     * Judge or settle a claim.
     *
     * One route rather than five: every one of these is the same document
     * moving between states, and splitting them would only spread the guard
     * that says which move is allowed across five controllers.
     */
    public function decide(Request $request, WarrantyClaim $claim): WarrantyClaimResource
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['approve', 'reject', 'repaired', 'replace'])],
            'note' => ['nullable', 'string', 'max:1000'],
            'reason' => ['required_if:action,reject', 'nullable', 'string', 'max:255'],
            'replacement_asset_id' => ['required_if:action,replace', 'nullable', 'exists:assets,id'],
        ]);

        $actor = $request->user();

        $claim = match ($data['action']) {
            'approve' => $this->warranty->approve($claim, $data['note'] ?? null),
            'reject' => $this->warranty->reject($claim, $data['reason']),
            'repaired' => $this->warranty->markRepaired($claim, $data['note'] ?? null),
            'replace' => $this->warranty->replace($claim, $data, $actor),
        };

        ActivityLog::record(
            "warranty.claim.{$data['action']}",
            $claim,
            "بلاغ الضمان {$claim->code}: {$claim->status->label()}",
        );

        return new WarrantyClaimResource(
            $claim->load(['warranty', 'asset.customer', 'task', 'replacement']),
        );
    }

    /** Raise the repair order — a work order like any other. */
    public function repairOrder(Request $request, WarrantyClaim $claim): JsonResponse
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'priority' => ['nullable', 'in:low,normal,high,urgent'],
            'assigned_to' => ['nullable', 'exists:users,id'],
            'scheduled_at' => ['nullable', 'date'],
        ]);

        $task = $this->warranty->raiseRepairOrder($claim, $data, $request->user());

        ActivityLog::record(
            'warranty.repair_order',
            $task,
            "أمر إصلاح {$task->code} للبلاغ {$claim->code}",
        );

        return (new TaskResource($task->load(['customer', 'asset', 'technician'])))
            ->response()->setStatusCode(201);
    }
}
