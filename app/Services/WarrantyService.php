<?php

namespace App\Services;

use App\Enums\ClaimStatus;
use App\Enums\TaskPriority;
use App\Enums\TaskType;
use App\Enums\WarrantyKind;
use App\Models\Asset;
use App\Models\Task;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that writes warranties and claims.
 *
 * Three rules live here and nowhere else, because each one is the sort a
 * screen would eventually forget:
 *
 *  · cover is judged against the date the fault happened, never the date the
 *    paperwork was filed;
 *  · an extension is a new record following the old one, so what was
 *    originally promised stays readable after the extension is sold;
 *  · a replacement carries the remaining cover to the new unit, because the
 *    customer bought a period of protection, not a particular serial number.
 */
class WarrantyService
{
    /* ── Registering cover ───────────────────────────────── */

    /**
     * Put an asset under warranty.
     *
     * The term can be given either as an end date or as a number of months
     * from the start — both are how people actually quote it, and converting
     * in the caller would mean converting it in four callers.
     *
     * @param  array<string, mixed>  $data
     */
    public function register(array $data, ?User $actor = null): Warranty
    {
        $asset = Asset::findOrFail($data['asset_id']);

        $starts = now()->parse($data['starts_on'] ?? $asset->sold_at ?? now())->toDateString();
        $ends = $this->endDate($starts, $data);

        if (now()->parse($ends)->lt(now()->parse($starts))) {
            throw ValidationException::withMessages([
                'ends_on' => 'تاريخ نهاية الضمان لا يمكن أن يسبق بدايته.',
            ]);
        }

        return Warranty::create([
            'asset_id' => $asset->id,
            // Taken from the asset rather than the request: a warranty that
            // named a different customer than the unit it covers would be
            // unarguable in exactly the moment it mattered.
            'customer_id' => $asset->customer_id,
            'kind' => $data['kind'] ?? WarrantyKind::Company->value,
            'covers' => $data['covers'] ?? 'both',
            'starts_on' => $starts,
            'ends_on' => $ends,
            'invoice_id' => $data['invoice_id'] ?? null,
            'supplier_id' => $data['supplier_id'] ?? null,
            'supplier_reference' => $data['supplier_reference'] ?? null,
            'terms' => $data['terms'] ?? null,
            'notes' => $data['notes'] ?? null,
            'created_by' => $actor?->id,
        ]);
    }

    /**
     * Sell more time on an existing warranty.
     *
     * The extension starts the day after the original ends, not today —
     * otherwise buying a year in the last month of cover would silently lose
     * the customer that month.
     *
     * @param  array<string, mixed>  $data
     */
    public function extend(Warranty $warranty, array $data, ?User $actor = null): Warranty
    {
        if ($warranty->status === 'void') {
            throw ValidationException::withMessages([
                'warranty' => 'لا يمكن تمديد ضمان ملغي.',
            ]);
        }

        $starts = $warranty->ends_on->copy()->addDay()->toDateString();
        $ends = $this->endDate($starts, $data);

        if (now()->parse($ends)->lte($warranty->ends_on)) {
            throw ValidationException::withMessages([
                'ends_on' => 'التمديد يجب أن ينتهي بعد الضمان الأصلي.',
            ]);
        }

        return Warranty::create([
            'asset_id' => $warranty->asset_id,
            'customer_id' => $warranty->customer_id,
            'kind' => WarrantyKind::Extension->value,
            // Inherited unless overridden: an extension that quietly narrowed
            // from "parts and labour" to "labour" would be a trap.
            'covers' => $data['covers'] ?? $warranty->covers,
            'starts_on' => $starts,
            'ends_on' => $ends,
            'parent_id' => $warranty->id,
            'invoice_id' => $data['invoice_id'] ?? null,
            'terms' => $data['terms'] ?? $warranty->terms,
            'notes' => $data['notes'] ?? null,
            'created_by' => $actor?->id,
        ]);
    }

    /** Tear one up — tampering, a unit never paid for, a clerical duplicate. */
    public function void(Warranty $warranty, string $reason, ?User $actor = null): Warranty
    {
        if ($warranty->claims()->whereIn('status', ['approved', 'repaired', 'replaced'])->exists()) {
            throw ValidationException::withMessages([
                'warranty' => 'لا يمكن إلغاء ضمان تم إصلاح أو استبدال جهاز تحته.',
            ]);
        }

        $warranty->forceFill(['status' => 'void', 'void_reason' => $reason])->save();

        return $warranty->fresh();
    }

    /* ── Claims ──────────────────────────────────────────── */

    /**
     * File a claim against whatever covered the unit on the day it failed.
     *
     * The caller names the asset and the date, not the warranty: picking the
     * warranty is precisely the judgement that gets made wrong by hand, and it
     * is the one thing here the database can answer exactly.
     *
     * @param  array<string, mixed>  $data
     */
    public function claim(array $data, ?User $actor = null): WarrantyClaim
    {
        $asset = Asset::findOrFail($data['asset_id']);
        $reportedOn = now()->parse($data['reported_on'] ?? now())->toDateString();

        $warranty = $this->coverFor($asset, $reportedOn);

        if (! $warranty) {
            throw ValidationException::withMessages([
                'asset_id' => 'لا يوجد ضمان ساري على هذا الجهاز في تاريخ العطل.',
            ]);
        }

        // One open claim at a time per unit. A second is nearly always the
        // same fault filed twice, and two repair orders for one failure is how
        // a technician ends up dispatched to a job someone else finished.
        $open = WarrantyClaim::where('asset_id', $asset->id)
            ->whereIn('status', ['open', 'approved'])
            ->first();

        if ($open) {
            throw ValidationException::withMessages([
                'asset_id' => "يوجد بلاغ ضمان مفتوح بالفعل على هذا الجهاز ({$open->code}).",
            ]);
        }

        return WarrantyClaim::create([
            'warranty_id' => $warranty->id,
            'asset_id' => $asset->id,
            'reported_on' => $reportedOn,
            'fault' => $data['fault'],
            'created_by' => $actor?->id,
        ]);
    }

    /** Accept liability. Past this a repair order can be raised. */
    public function approve(WarrantyClaim $claim, ?string $note = null): WarrantyClaim
    {
        $this->refuseIfSettled($claim);

        $claim->forceFill([
            'status' => ClaimStatus::Approved,
            'decision_note' => $note,
        ])->save();

        return $claim->fresh();
    }

    /** Refuse it, on the record. A reason is required, not optional. */
    public function reject(WarrantyClaim $claim, string $reason): WarrantyClaim
    {
        $this->refuseIfSettled($claim);

        $claim->forceFill([
            'status' => ClaimStatus::Rejected,
            'decision_note' => $reason,
            'resolved_at' => now(),
        ])->save();

        return $claim->fresh();
    }

    /**
     * Raise the repair order.
     *
     * A work order, not a second kind of document: it goes to the same
     * dispatch board, takes the same completion report and consumes parts from
     * the same van stock as everything else the technicians do.
     *
     * @param  array<string, mixed>  $data
     */
    public function raiseRepairOrder(WarrantyClaim $claim, array $data = [], ?User $actor = null): Task
    {
        if ($claim->status !== ClaimStatus::Approved) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن فتح أمر إصلاح قبل اعتماد البلاغ.',
            ]);
        }

        if ($claim->task_id) {
            throw ValidationException::withMessages([
                'task' => 'تم فتح أمر إصلاح لهذا البلاغ بالفعل.',
            ]);
        }

        return DB::transaction(function () use ($claim, $data, $actor) {
            $asset = $claim->asset;

            $task = Task::create([
                'customer_id' => $asset->customer_id,
                'branch_id' => $asset->branch_id,
                'asset_id' => $asset->id,
                'title' => $data['title'] ?? "إصلاح تحت الضمان — {$claim->code}",
                'description' => $data['description'] ?? $claim->fault,
                'type' => TaskType::Repair->value,
                'priority' => $data['priority'] ?? TaskPriority::High->value,
                'assigned_to' => $data['assigned_to'] ?? null,
                'scheduled_at' => $data['scheduled_at'] ?? null,
                'site_address' => $asset->site_address,
                'site_lat' => $asset->site_lat,
                'site_lng' => $asset->site_lng,
                'created_by' => $actor?->id,
            ]);

            $claim->forceFill(['task_id' => $task->id])->save();

            return $task;
        });
    }

    /** The fault was put right on the unit that had it. */
    public function markRepaired(WarrantyClaim $claim, ?string $note = null): WarrantyClaim
    {
        if ($claim->status !== ClaimStatus::Approved) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إقفال بلاغ لم يُعتمد.',
            ]);
        }

        $claim->forceFill([
            'status' => ClaimStatus::Repaired,
            'decision_note' => $note ?? $claim->decision_note,
            'resolved_at' => now(),
        ])->save();

        return $claim->fresh();
    }

    /**
     * Answer the fault with a different unit.
     *
     * What the customer bought was a period of protection, so whatever was
     * left of it moves to the replacement as its own warranty record. The
     * original is left untouched and the old unit is retired — rewriting the
     * old warranty to point at the new serial would erase the swap.
     *
     * @param  array<string, mixed>  $data
     */
    public function replace(WarrantyClaim $claim, array $data, ?User $actor = null): WarrantyClaim
    {
        if ($claim->status !== ClaimStatus::Approved) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن استبدال جهاز قبل اعتماد البلاغ.',
            ]);
        }

        $replacement = Asset::findOrFail($data['replacement_asset_id']);

        if ($replacement->id === $claim->asset_id) {
            throw ValidationException::withMessages([
                'replacement_asset_id' => 'لا يمكن استبدال الجهاز بنفسه.',
            ]);
        }

        return DB::transaction(function () use ($claim, $replacement, $actor) {
            $original = $claim->warranty;
            $faulty = $claim->asset;

            // Transferred cover ends the day the original would have, so the
            // swap neither shortens nor extends what was promised.
            Warranty::create([
                'asset_id' => $replacement->id,
                'customer_id' => $replacement->customer_id ?? $original->customer_id,
                'kind' => $original->kind->value,
                'covers' => $original->covers,
                'starts_on' => now()->toDateString(),
                'ends_on' => $original->ends_on->toDateString(),
                'parent_id' => $original->id,
                'terms' => $original->terms,
                'notes' => "ضمان منقول من الجهاز {$faulty->code} ببلاغ {$claim->code}",
                'created_by' => $actor?->id,
            ]);

            $faulty->forceFill(['status' => 'retired'])->save();

            $claim->forceFill([
                'status' => ClaimStatus::Replaced,
                'replacement_asset_id' => $replacement->id,
                'resolved_at' => now(),
            ])->save();

            return $claim->fresh(['replacement', 'warranty']);
        });
    }

    /**
     * Turn the old two-column terms into warranty records.
     *
     * The asset page falls back to `sold_at` + `warranty_months` when a unit
     * has no record, so a device can read as covered while there is nothing to
     * file a claim against. Backfilling closes that gap rather than teaching
     * `claim()` to invent cover on the fly, which would create a warranty
     * nobody chose to grant.
     *
     * Idempotent: assets that already have a record are skipped, so this is
     * safe to run again after importing more devices.
     *
     * @return int how many were created
     */
    public function backfillFromAssets(?User $actor = null): int
    {
        $assets = Asset::query()
            ->whereNotNull('sold_at')
            ->whereNotNull('warranty_months')
            ->whereDoesntHave('warranties')
            ->get();

        foreach ($assets as $asset) {
            Warranty::create([
                'asset_id' => $asset->id,
                'customer_id' => $asset->customer_id,
                'kind' => WarrantyKind::Company->value,
                'covers' => 'both',
                'starts_on' => $asset->sold_at->toDateString(),
                'ends_on' => $asset->soldWarrantyEndsAt()->subDay()->toDateString(),
                'notes' => 'مُرحّل من بيانات البيع المسجّلة على الجهاز',
                'created_by' => $actor?->id,
            ]);
        }

        return $assets->count();
    }

    /* ── Reading cover ───────────────────────────────────── */

    /**
     * What covers this unit on a given date — the longest-running one if more
     * than one does, since that is what the customer would hold us to.
     */
    public function coverFor(Asset $asset, ?string $on = null): ?Warranty
    {
        return Warranty::query()
            ->where('asset_id', $asset->id)
            ->effective($on)
            ->orderByDesc('ends_on')
            ->first();
    }

    /**
     * Everything on one unit, oldest first: warranties, claims and the repair
     * orders they produced. This is «تاريخ الجهاز» — the answer to "what has
     * this machine cost us".
     *
     * @return array<string, mixed>
     */
    public function history(Asset $asset): array
    {
        $warranties = Warranty::where('asset_id', $asset->id)
            ->with(['supplier', 'invoice', 'parent'])
            ->orderBy('starts_on')
            ->get();

        $claims = WarrantyClaim::where('asset_id', $asset->id)
            ->with(['task', 'replacement', 'warranty'])
            ->orderBy('reported_on')
            ->get();

        return [
            'cover' => $this->coverFor($asset),
            'warranties' => $warranties,
            'claims' => $claims,
            'claims_open' => $claims->whereIn('status', [ClaimStatus::Open, ClaimStatus::Approved])->count(),
            // Repairs done under warranty are the number that decides whether
            // a model is worth stocking again.
            'repairs' => $claims->where('status', ClaimStatus::Repaired)->count(),
            'replacements' => $claims->where('status', ClaimStatus::Replaced)->count(),
        ];
    }

    /* ── Internals ───────────────────────────────────────── */

    /**
     * A term given either way round: an explicit end date, or months from the
     * start.
     *
     * @param  array<string, mixed>  $data
     */
    protected function endDate(string $starts, array $data): string
    {
        if (! empty($data['ends_on'])) {
            return now()->parse($data['ends_on'])->toDateString();
        }

        $months = (int) ($data['months'] ?? 12);

        if ($months < 1) {
            throw ValidationException::withMessages([
                'months' => 'مدة الضمان يجب أن تكون شهرًا واحدًا على الأقل.',
            ]);
        }

        // A twelve-month warranty starting 1 Jan runs to 31 Dec, not to 1 Jan
        // of the next year — otherwise every term is a day long.
        return now()->parse($starts)->addMonths($months)->subDay()->toDateString();
    }

    protected function refuseIfSettled(WarrantyClaim $claim): void
    {
        if ($claim->status->isFinal()) {
            throw ValidationException::withMessages([
                'status' => 'تم إغلاق هذا البلاغ بالفعل.',
            ]);
        }
    }
}
