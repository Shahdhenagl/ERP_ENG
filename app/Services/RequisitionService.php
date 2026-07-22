<?php

namespace App\Services;

use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that moves a purchase request between its states.
 *
 * The rule that matters: **nobody approves their own request.** Everything else
 * here is bookkeeping around that one separation, which is the only reason the
 * document exists rather than a note in a phone call.
 */
class RequisitionService
{
    /**
     * Raise a request. Anyone may — a technician who has just run out is the
     * person who knows.
     *
     * @param  array<string, mixed>  $data
     */
    public function draft(array $data, User $requester): PurchaseRequest
    {
        return DB::transaction(function () use ($data, $requester) {
            $request = PurchaseRequest::create([
                'requested_by' => $requester->id,
                'task_id' => $data['task_id'] ?? null,
                'warehouse_id' => $data['warehouse_id'] ?? null,
                'needed_by' => $data['needed_by'] ?? null,
                'priority' => $data['priority'] ?? 'normal',
                'reason' => $data['reason'] ?? null,
            ]);

            return $this->syncLines($request, $data['lines'] ?? []);
        });
    }

    /** @param  array<int, array<string, mixed>>  $lines */
    public function syncLines(PurchaseRequest $request, array $lines): PurchaseRequest
    {
        if (! $request->isEditable()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن تعديل طلب بعد إرساله.',
            ]);
        }

        DB::transaction(function () use ($request, $lines) {
            $request->lines()->delete();

            foreach (array_values($lines) as $sort => $line) {
                $item = ! empty($line['item_id']) ? Item::find($line['item_id']) : null;
                $qty = round((float) $line['qty'], 3);

                if ($qty <= 0) {
                    continue;
                }

                $request->lines()->create([
                    'item_id' => $item?->id,
                    // A technician needing something the catalogue never carried
                    // asks for it by name rather than being told to create an
                    // item record first.
                    'description' => $line['description'] ?? $item?->name ?? '',
                    'qty' => $qty,
                    'unit' => $line['unit'] ?? $item?->unit,
                    'note' => $line['note'] ?? null,
                    'sort' => $sort,
                ]);
            }
        });

        return $request->fresh(['lines']);
    }

    /** Hand it over. Past this the requester can no longer change it. */
    public function submit(PurchaseRequest $request): PurchaseRequest
    {
        if ($request->status !== 'draft') {
            throw ValidationException::withMessages([
                'status' => 'تم إرسال هذا الطلب بالفعل.',
            ]);
        }

        if ($request->lines()->count() === 0) {
            throw ValidationException::withMessages([
                'lines' => 'لا يمكن إرسال طلب بدون أصناف.',
            ]);
        }

        $request->forceFill(['status' => 'submitted'])->save();

        return $request->fresh(['lines', 'requester']);
    }

    public function approve(PurchaseRequest $request, User $decider, ?string $note = null): PurchaseRequest
    {
        $this->assertDecidable($request, $decider);

        $request->forceFill([
            'status' => 'approved',
            'decided_by' => $decider->id,
            'decided_at' => now(),
            'decision_note' => $note,
        ])->save();

        return $request->fresh(['lines', 'requester', 'decider']);
    }

    /** Refuse it, on the record. A reason is required, not optional. */
    public function reject(PurchaseRequest $request, User $decider, string $reason): PurchaseRequest
    {
        $this->assertDecidable($request, $decider);

        $request->forceFill([
            'status' => 'rejected',
            'decided_by' => $decider->id,
            'decided_at' => now(),
            'decision_note' => $reason,
        ])->save();

        return $request->fresh(['lines', 'requester', 'decider']);
    }

    /**
     * Turn an approved request into a purchase order.
     *
     * Lines with no catalogue item behind them are dropped: an order line has
     * to name something the supplier can be asked for and the store can receive
     * against. What was asked for stays on the request, so nothing is lost —
     * it just needs an item record before it can be bought.
     */
    public function toOrder(PurchaseRequest $request, Supplier $supplier, User $actor): PurchaseOrder
    {
        if ($request->status !== 'approved') {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن تحويل طلب غير معتمد إلى أمر شراء.',
            ]);
        }

        $catalogued = $request->lines->filter(fn ($line) => $line->item_id !== null);

        if ($catalogued->isEmpty()) {
            throw ValidationException::withMessages([
                'lines' => 'لا يوجد صنف مسجّل في المخزون ضمن هذا الطلب. أضف الأصناف أولًا.',
            ]);
        }

        return DB::transaction(function () use ($request, $catalogued, $supplier, $actor) {
            $order = PurchaseOrder::create([
                'supplier_id' => $supplier->id,
                'order_date' => now()->toDateString(),
                'expected_date' => $request->needed_by,
                'notes' => "من طلب الشراء {$request->code}",
                'created_by' => $actor->id,
            ]);

            foreach ($catalogued->values() as $sort => $line) {
                $order->lines()->create([
                    'item_id' => $line->item_id,
                    'qty' => $line->qty,
                    // Priced at the last known cost, which is a starting point
                    // for the buyer rather than a claim about the supplier.
                    'unit_price' => (float) ($line->item?->avg_cost ?? 0),
                    'sort' => $sort,
                ]);
            }

            $request->forceFill([
                'status' => 'ordered',
                'purchase_order_id' => $order->id,
            ])->save();

            return $order->fresh(['lines', 'supplier']);
        });
    }

    public function discard(PurchaseRequest $request): void
    {
        if (! $request->isEditable()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن حذف طلب بعد إرساله.',
            ]);
        }

        $request->delete();
    }

    /* ── Internals ───────────────────────────────────────── */

    protected function assertDecidable(PurchaseRequest $request, User $decider): void
    {
        if (! $request->isPending()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن البتّ إلا في طلب مُرسَل.',
            ]);
        }

        // The separation the document exists for. Without it the request is a
        // note the requester wrote to themselves.
        if ($request->requested_by === $decider->id) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن اعتماد طلب قدّمته بنفسك.',
            ]);
        }
    }
}
