<?php

namespace App\Services;

use App\Enums\WarehouseType;
use App\Models\Asset;
use App\Models\AssetCustody;
use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Item;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * What a technician is holding, in the three forms it comes in: stock, money,
 * and devices.
 *
 * Nothing here invents a parallel ledger. Stock custody is a warehouse, money
 * custody is a cash box, and both are written by the services that already own
 * those ledgers — so the totals a manager sees still add up to the company's.
 * Devices are the exception: a unit off the shelf and not yet anywhere had no
 * record at all, so it gets one.
 */
class CustodyService
{
    public function __construct(
        protected StockLedger $ledger,
        protected BillingService $billing,
    ) {}

    /* ── Money ───────────────────────────────────────────── */

    /** The technician's float, opened the first time they are given one. */
    public function cashBoxFor(User $technician): CashBox
    {
        return CashBox::firstOrCreate(
            ['user_id' => $technician->id],
            ['name' => "عهدة {$technician->name}", 'type' => 'custody'],
        );
    }

    /**
     * Hand a technician money. It leaves a company box and lands in theirs, so
     * the treasury total is unchanged — it has simply moved.
     */
    public function advanceCash(
        User $technician,
        float $amount,
        CashBox $from,
        User $actor,
        ?string $note = null,
    ): void {
        $this->assertTechnician($technician);

        $to = $this->cashBoxFor($technician);

        // Guards on amount and available balance live in BillingService, so a
        // custody advance cannot overdraw a box that an expense could not.
        $this->billing->transferBetweenBoxes($from, $to, $amount, $actor, $note);

        CashMovement::where('cash_box_id', $to->id)
            ->latest('id')
            ->limit(1)
            ->update(['source' => 'custody_advance']);
    }

    /** Money coming back off a technician, unspent. */
    public function returnCash(
        User $technician,
        float $amount,
        CashBox $to,
        User $actor,
        ?string $note = null,
    ): void {
        $from = $this->cashBoxFor($technician);

        $this->billing->transferBetweenBoxes($from, $to, $amount, $actor, $note);

        CashMovement::where('cash_box_id', $from->id)
            ->latest('id')
            ->limit(1)
            ->update(['source' => 'custody_settle']);
    }

    /**
     * Something the technician paid for out of their float — transport, a part
     * bought on the way. It leaves their custody the way any expense leaves a
     * box, which is what makes the remaining balance mean anything.
     */
    public function spendFromCustody(
        User $technician,
        float $amount,
        User $actor,
        array $context = [],
    ): CashMovement {
        return $this->billing->recordExpense(
            $this->cashBoxFor($technician),
            $amount,
            $actor,
            $context,
        );
    }

    /* ── Devices ─────────────────────────────────────────── */

    /**
     * Record that a technician has taken a device away.
     *
     * A unit can only be in one pair of hands, so an open custody blocks a
     * second — otherwise two technicians would both show as holding it and
     * neither would be accountable.
     */
    public function takeDevice(Asset $asset, User $technician, User $actor, array $context = []): AssetCustody
    {
        $this->assertTechnician($technician);

        if ($open = AssetCustody::open()->where('asset_id', $asset->id)->with('holder')->first()) {
            throw ValidationException::withMessages([
                'asset_id' => "الجهاز في عهدة {$open->holder?->name} بالفعل.",
            ]);
        }

        return AssetCustody::create([
            'asset_id' => $asset->id,
            'user_id' => $technician->id,
            'reason' => $context['reason'] ?? 'workshop_repair',
            'taken_from' => $context['taken_from'] ?? $asset->branch?->name ?? $asset->customer?->name,
            'task_id' => $context['task_id'] ?? null,
            'taken_at' => $context['taken_at'] ?? now(),
            'note' => $context['note'] ?? null,
            'created_by' => $actor->id,
        ]);
    }

    /** Hand it back — to the customer, into stock, or wherever it ended up. */
    public function returnDevice(AssetCustody $custody, User $actor, array $context = []): AssetCustody
    {
        if (! $custody->isOpen()) {
            throw ValidationException::withMessages([
                'custody' => 'هذه العهدة مُسلَّمة بالفعل.',
            ]);
        }

        $custody->forceFill([
            'returned_at' => $context['returned_at'] ?? now(),
            'returned_to' => $context['returned_to'] ?? null,
            'note' => $context['note'] ?? $custody->note,
        ])->save();

        return $custody->fresh();
    }

    /* ── The whole picture ───────────────────────────────── */

    /**
     * Everything one technician is answerable for, in one shape — which is the
     * question a manager actually asks, rather than three separate ones.
     */
    public function statementFor(User $technician): array
    {
        $box = CashBox::where('user_id', $technician->id)->first();
        $van = Warehouse::where('user_id', $technician->id)->first();

        $stock = $van
            ? $van->levels()->with('item')->where('qty', '>', 0)->get()
                ->map(fn ($level) => [
                    'item_id' => $level->item_id,
                    'name' => $level->item->name,
                    'unit' => $level->item->unit,
                    'qty' => (float) $level->qty,
                    'value' => round((float) $level->qty * (float) $level->item->avg_cost, 2),
                ])
                ->values()
            : collect();

        $devices = AssetCustody::open()
            ->where('user_id', $technician->id)
            ->with('asset.customer')
            ->get()
            ->map(fn (AssetCustody $custody) => [
                'id' => $custody->id,
                'asset_id' => $custody->asset_id,
                'asset' => $custody->asset?->label(),
                'serial' => $custody->asset?->serial,
                'customer' => $custody->asset?->customer?->name,
                'reason' => $custody->reason,
                'reason_label' => $custody->reasonLabel(),
                'taken_from' => $custody->taken_from,
                'taken_at' => $custody->taken_at?->toIso8601String(),
                'days_held' => $custody->daysHeld(),
            ]);

        return [
            'technician' => [
                'id' => $technician->id,
                'name' => $technician->name,
                'phone' => $technician->phone,
                'job_title' => $technician->job_title,
            ],
            'cash' => [
                'box_id' => $box?->id,
                'balance' => $box ? $box->balance() : 0.0,
            ],
            'stock' => [
                'warehouse_id' => $van?->id,
                'lines' => $stock,
                'value' => round($stock->sum('value'), 2),
            ],
            'devices' => $devices,
            // One number for "how exposed are we with this person".
            'total_value' => round(($box ? $box->balance() : 0) + $stock->sum('value'), 2),
        ];
    }

    /** Every technician's custody, for the overview screen. */
    public function allStatements(): array
    {
        return User::query()
            ->technicians()
            ->active()
            ->orderBy('name')
            ->get()
            ->map(fn (User $technician) => $this->statementFor($technician))
            ->all();
    }

    /** Movements in and out of one technician's stock custody. */
    public function stockHistoryFor(User $technician, int $limit = 30): array
    {
        $van = Warehouse::where('user_id', $technician->id)->first();

        if (! $van) {
            return [];
        }

        return StockMovement::query()
            ->where(fn ($q) => $q->where('from_warehouse_id', $van->id)->orWhere('to_warehouse_id', $van->id))
            ->with(['item', 'task', 'actor'])
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (StockMovement $movement) => [
                'id' => $movement->id,
                'type' => $movement->type->value,
                'type_label' => $movement->type->label(),
                'item' => $movement->item?->name,
                'qty' => $movement->signedQtyFor($van->id),
                'task_code' => $movement->task?->code,
                'note' => $movement->note,
                'actor' => $movement->actor?->name,
                'created_at' => $movement->created_at?->toIso8601String(),
            ])
            ->all();
    }

    /* ── Stores ──────────────────────────────────────────── */

    /** Open another company store. */
    public function openStore(array $data): Warehouse
    {
        return Warehouse::create([
            'name' => $data['name'],
            'type' => WarehouseType::Store,
            'address' => $data['address'] ?? null,
            'keeper' => $data['keeper'] ?? null,
            'is_default' => false,
        ]);
    }

    /**
     * Close a store. Refused while it still holds anything — the balance would
     * vanish from the totals without any movement explaining where it went.
     */
    public function closeStore(Warehouse $warehouse): void
    {
        if ($warehouse->isVan()) {
            throw ValidationException::withMessages([
                'warehouse' => 'عهدة الفني تُغلق بتسليم ما بها، لا بالحذف.',
            ]);
        }

        if ($warehouse->is_default) {
            throw ValidationException::withMessages([
                'warehouse' => 'لا يمكن حذف المخزن الافتراضي. اجعل مخزنًا آخر افتراضيًا أولًا.',
            ]);
        }

        if ($warehouse->levels()->where('qty', '>', 0)->exists()) {
            throw ValidationException::withMessages([
                'warehouse' => 'لا يمكن حذف مخزن به رصيد. حوّل ما به أولًا.',
            ]);
        }

        DB::transaction(function () use ($warehouse) {
            $warehouse->levels()->delete();
            $warehouse->delete();
        });
    }

    protected function assertTechnician(User $user): void
    {
        if (! $user->isTechnician()) {
            throw ValidationException::withMessages([
                'user_id' => 'العهدة تُسلَّم لفني فقط.',
            ]);
        }
    }
}
