<?php

namespace App\Services;

use App\Enums\MovementType;
use App\Models\Item;
use App\Models\StockLevel;
use App\Models\StockMovement;
use App\Models\Task;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that writes stock. Balances and the ledger are updated
 * together in one transaction, so `stock_levels` can always be re-derived from
 * `stock_movements` — the moment those two can drift, the numbers stop being
 * evidence of anything.
 *
 * Costing is a weighted moving average, recalculated on receipt only. Moving
 * goods between the store and a van does not change what they cost.
 */
class StockLedger
{
    /**
     * Goods arriving from a supplier. This is the only operation that moves an
     * item's average cost.
     */
    public function receive(
        Item $item,
        Warehouse $warehouse,
        float $qty,
        float $unitCost,
        User $actor,
        array $context = [],
    ): StockMovement {
        $this->assertPositive($qty);

        if ($unitCost < 0) {
            throw ValidationException::withMessages([
                'unit_cost' => 'سعر الوحدة لا يمكن أن يكون سالبًا.',
            ]);
        }

        return DB::transaction(function () use ($item, $warehouse, $qty, $unitCost, $actor, $context) {
            $this->recalculateAverageCost($item, $qty, $unitCost);
            $this->add($item, $warehouse, $qty);

            return $this->log($item, MovementType::Receipt, $qty, $unitCost, $actor, [
                'to_warehouse_id' => $warehouse->id,
                // Who it came from is set as the row is written, not stamped on
                // afterwards: the accounting entry is raised the moment the
                // movement exists, and a receipt with no supplier on it books
                // as stock appearing from nowhere rather than as a purchase.
                'supplier_id' => $context['supplier_id'] ?? null,
                'purchase_order_id' => $context['purchase_order_id'] ?? null,
                'supplier' => $context['supplier'] ?? null,
                'reference' => $context['reference'] ?? null,
                'note' => $context['note'] ?? null,
            ]);
        });
    }

    /** Store → van, or a van handing stock back. */
    public function transfer(
        Item $item,
        Warehouse $from,
        Warehouse $to,
        float $qty,
        User $actor,
        ?string $note = null,
    ): StockMovement {
        $this->assertPositive($qty);

        if ($from->id === $to->id) {
            throw ValidationException::withMessages([
                'to_warehouse_id' => 'لا يمكن التحويل إلى نفس المخزن.',
            ]);
        }

        return DB::transaction(function () use ($item, $from, $to, $qty, $actor, $note) {
            $this->subtract($item, $from, $qty);
            $this->add($item, $to, $qty);

            return $this->log($item, MovementType::Transfer, $qty, (float) $item->avg_cost, $actor, [
                'from_warehouse_id' => $from->id,
                'to_warehouse_id' => $to->id,
                'note' => $note,
            ]);
        });
    }

    /**
     * Parts consumed on a job. Costed at the average in force at the time and
     * stamped on the movement, so the job's cost stays true even after later
     * purchases move the average.
     */
    public function issueToTask(
        Item $item,
        Warehouse $from,
        float $qty,
        Task $task,
        User $actor,
        ?string $note = null,
    ): StockMovement {
        $this->assertPositive($qty);

        return DB::transaction(function () use ($item, $from, $qty, $task, $actor, $note) {
            $this->subtract($item, $from, $qty);

            return $this->log($item, MovementType::Issue, $qty, (float) $item->avg_cost, $actor, [
                'from_warehouse_id' => $from->id,
                'task_id' => $task->id,
                'note' => $note,
            ]);
        });
    }

    /**
     * Stocktake correction. `qty` is the counted figure, not the difference —
     * asking a storekeeper for a delta is how sign errors get in.
     */
    public function adjust(
        Item $item,
        Warehouse $warehouse,
        float $countedQty,
        User $actor,
        ?string $note = null,
    ): ?StockMovement {
        if ($countedQty < 0) {
            throw ValidationException::withMessages([
                'qty' => 'الكمية المجرودة لا يمكن أن تكون سالبة.',
            ]);
        }

        return DB::transaction(function () use ($item, $warehouse, $countedQty, $actor, $note) {
            $level = $this->level($item, $warehouse, lock: true);
            $difference = round($countedQty - (float) $level->qty, 3);

            // A count that matches the book is a valid outcome, not an event.
            if ($difference === 0.0) {
                return null;
            }

            $level->qty = $countedQty;
            $level->save();

            // Quantity stays positive on every movement; direction is carried
            // by which warehouse column is filled. Signing both would count the
            // direction twice and a replay of the ledger would not add up.
            return $this->log(
                $item,
                MovementType::Adjustment,
                abs($difference),
                (float) $item->avg_cost,
                $actor,
                [
                    $difference > 0 ? 'to_warehouse_id' : 'from_warehouse_id' => $warehouse->id,
                    'note' => $note,
                ],
            );
        });
    }

    /**
     * Bring stock in line with what a job's report says was used.
     *
     * A report can be filed and then corrected, so this reconciles rather than
     * deducts: it works out what has already been issued to this job and moves
     * only the difference. Filing the same report twice must not consume the
     * parts twice, and lowering a quantity must put the balance back.
     *
     * Free-text lines with no item are ignored — a part bought on the way to
     * site was never in stock, and inventing a movement for it would be a lie.
     *
     * @param  array<int, array{item_id?: int|null, qty?: float|null}>  $partsUsed
     * @return array<int, StockMovement>
     */
    public function syncTaskConsumption(Task $task, array $partsUsed, User $technician): array
    {
        $warehouse = Warehouse::forTechnician($technician);

        // Collapse duplicate lines for the same item before comparing.
        $wanted = [];

        foreach ($partsUsed as $part) {
            $itemId = $part['item_id'] ?? null;
            $qty = (float) ($part['qty'] ?? 0);

            if (! $itemId || $qty <= 0) {
                continue;
            }

            $wanted[$itemId] = ($wanted[$itemId] ?? 0) + $qty;
        }

        $alreadyIssued = $this->issuedToTask($task);
        $movements = [];

        foreach (array_unique([...array_keys($wanted), ...array_keys($alreadyIssued)]) as $itemId) {
            $target = round($wanted[$itemId] ?? 0, 3);
            $current = round($alreadyIssued[$itemId] ?? 0, 3);
            $delta = round($target - $current, 3);

            if ($delta === 0.0) {
                continue;
            }

            $item = Item::find($itemId);

            if (! $item) {
                continue;
            }

            $movements[] = $delta > 0
                ? $this->issueToTask($item, $warehouse, $delta, $task, $technician, 'من تقرير المهمة')
                : $this->returnFromTask($item, $warehouse, abs($delta), $task, $technician);
        }

        return $movements;
    }

    /** Net quantity already consumed on this job, per item. */
    protected function issuedToTask(Task $task): array
    {
        return StockMovement::query()
            ->where('task_id', $task->id)
            ->whereIn('type', [MovementType::Issue, MovementType::Return])
            ->get()
            ->groupBy('item_id')
            ->map(fn ($rows) => $rows->sum(
                fn (StockMovement $m) => $m->type === MovementType::Issue
                    ? (float) $m->qty
                    : -(float) $m->qty,
            ))
            ->all();
    }

    /** Parts reported in error, going back on the van. */
    protected function returnFromTask(
        Item $item,
        Warehouse $to,
        float $qty,
        Task $task,
        User $actor,
    ): StockMovement {
        return DB::transaction(function () use ($item, $to, $qty, $task, $actor) {
            $this->add($item, $to, $qty);

            return $this->log($item, MovementType::Return, $qty, (float) $item->avg_cost, $actor, [
                'to_warehouse_id' => $to->id,
                'task_id' => $task->id,
                'note' => 'تصحيح تقرير المهمة',
            ]);
        });
    }

    // ── Internals ────────────────────────────────────────────

    /**
     * new average = (value on hand + value received) / (qty on hand + qty received)
     *
     * Uses the total across every location: a van holds company stock too, and
     * leaving it out would overstate the average after a receipt.
     */
    protected function recalculateAverageCost(Item $item, float $qty, float $unitCost): void
    {
        $onHand = (float) $item->levels()->sum('qty');
        $currentValue = $onHand * (float) $item->avg_cost;
        $incomingValue = $qty * $unitCost;
        $newQty = $onHand + $qty;

        // Receiving into a position that was zero (or negative from a
        // correction) means the arriving price is simply the new average.
        $item->avg_cost = $newQty > 0
            ? round(($currentValue + $incomingValue) / $newQty, 2)
            : round($unitCost, 2);

        $item->save();
    }

    protected function add(Item $item, Warehouse $warehouse, float $qty): void
    {
        $level = $this->level($item, $warehouse, lock: true);
        $level->qty = round((float) $level->qty + $qty, 3);
        $level->save();
    }

    protected function subtract(Item $item, Warehouse $warehouse, float $qty): void
    {
        $level = $this->level($item, $warehouse, lock: true);
        $available = (float) $level->qty;

        // Refusing to go negative is what keeps the balance meaningful. A
        // technician who used something that was never booked in needs the
        // storekeeper to receive it first, not a silent negative.
        if ($available + 1e-6 < $qty) {
            throw ValidationException::withMessages([
                'qty' => "الكمية المتاحة من «{$item->name}» في «{$warehouse->name}» هي {$available} فقط.",
            ]);
        }

        $level->qty = round($available - $qty, 3);
        $level->save();
    }

    /** Row-locked so two concurrent issues cannot both read the same balance. */
    protected function level(Item $item, Warehouse $warehouse, bool $lock = false): StockLevel
    {
        StockLevel::firstOrCreate(
            ['item_id' => $item->id, 'warehouse_id' => $warehouse->id],
            ['qty' => 0],
        );

        $query = StockLevel::where('item_id', $item->id)->where('warehouse_id', $warehouse->id);

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->first();
    }

    /** @param  array<string, mixed>  $attributes */
    protected function log(
        Item $item,
        MovementType $type,
        float $qty,
        float $unitCost,
        User $actor,
        array $attributes = [],
    ): StockMovement {
        return StockMovement::create([
            'item_id' => $item->id,
            'type' => $type,
            'qty' => $qty,
            'unit_cost' => round($unitCost, 2),
            'user_id' => $actor->id,
            ...$attributes,
        ]);
    }

    protected function assertPositive(float $qty): void
    {
        if ($qty <= 0) {
            throw ValidationException::withMessages([
                'qty' => 'الكمية يجب أن تكون أكبر من صفر.',
            ]);
        }
    }
}
