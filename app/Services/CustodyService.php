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
        // Overdraw is allowed: a technician may spend past their float on the
        // road, and the box goes negative to record what the company owes them.
        return $this->billing->recordExpense(
            $this->cashBoxFor($technician),
            $amount,
            $actor,
            $context,
            allowOverdraw: true,
        );
    }

    /**
     * The shortfall on a technician's float — what they have spent beyond what
     * was advanced, and so what the company owes them. Zero when in credit.
     */
    public function shortfallFor(User $technician): float
    {
        $box = CashBox::where('user_id', $technician->id)->first();

        return $box ? round(max(0.0, -$box->balance()), 2) : 0.0;
    }

    /**
     * Pay the technician the difference: a real advance out of a company box,
     * bringing their float back to zero. This is money out — the expense they
     * fronted is reimbursed.
     */
    public function settleShortfall(User $technician, CashBox $from, User $actor): float
    {
        $shortfall = $this->shortfallFor($technician);

        if ($shortfall <= 0) {
            throw ValidationException::withMessages(['amount' => 'لا يوجد فرق مستحق على العهدة.']);
        }

        $this->advanceCash($technician, $shortfall, $from, $actor, 'صرف فرق العهدة');

        return $shortfall;
    }

    /**
     * Write the difference off instead of paying it: the technician bears the
     * cost. A non-cash entry zeroes the float and reverses the expense the
     * company will not carry, so nothing appears from nowhere.
     */
    public function waiveShortfall(User $technician, User $actor): float
    {
        $box = $this->cashBoxFor($technician);
        $shortfall = round(max(0.0, -$box->balance()), 2);

        if ($shortfall <= 0) {
            throw ValidationException::withMessages(['amount' => 'لا يوجد فرق على العهدة.']);
        }

        CashMovement::create([
            'cash_box_id' => $box->id,
            'direction' => 'in',
            'amount' => $shortfall,
            'source' => 'custody_waive',
            'note' => 'تجاوز فرق العهدة — لا يُصرف للفني',
            'user_id' => $actor->id,
        ]);

        return $shortfall;
    }

    /**
     * The float's ledger: every advance in, expense out and settlement, newest
     * first — so the technician sees how much was handed to them and where it
     * went.
     *
     * @return array<int, array<string, mixed>>
     */
    public function ledgerFor(User $technician, int $limit = 60): array
    {
        $box = CashBox::where('user_id', $technician->id)->first();

        if (! $box) {
            return [];
        }

        return CashMovement::query()
            ->where('cash_box_id', $box->id)
            ->with(['actor', 'task'])
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (CashMovement $m) => [
                'id' => $m->id,
                'direction' => $m->direction,
                'amount' => (float) $m->amount,
                'source' => $m->source,
                'label' => $this->movementLabel($m),
                'category' => $m->category,
                'note' => $m->note,
                'task_id' => $m->task_id,
                'task_code' => $m->task?->code,
                'receipt_url' => $m->receiptUrl(),
                'by' => $m->actor?->name,
                'created_at' => $m->created_at?->toIso8601String(),
            ])
            ->all();
    }

    /** A short human label for a custody-box movement. */
    protected function movementLabel(CashMovement $movement): string
    {
        return match ($movement->source) {
            'custody_advance' => 'عهدة مصروفة',
            'custody_settle' => 'ردّ عهدة',
            'custody_waive' => 'تجاوز فرق',
            'expense' => $movement->category ?: 'مصروف',
            default => $movement->category ?: 'حركة',
        };
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
        // Everyone actually holding custody in any of its forms — cash, a van of
        // stock, or a device — whatever their role. A user picks up a line here
        // the moment they are given any of the three.
        $holders = collect()
            ->merge(CashBox::whereNotNull('user_id')->pluck('user_id'))
            ->merge(Warehouse::where('type', 'van')->whereNotNull('user_id')->pluck('user_id'))
            ->merge(AssetCustody::open()->pluck('user_id'))
            ->unique()
            ->filter()
            ->values();

        return User::query()
            ->whereIn('id', $holders)
            ->active()
            ->orderBy('name')
            ->get()
            ->map(fn (User $holder) => $this->statementFor($holder))
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

    /**
     * What a technician spent out of their float — the expenses behind the
     * balance, each with the receipt photographed against it.
     *
     * @return array<int, array<string, mixed>>
     */
    public function expensesFor(User $technician, ?string $month = null, int $limit = 50): array
    {
        $box = CashBox::where('user_id', $technician->id)->first();

        if (! $box) {
            return [];
        }

        return CashMovement::query()
            ->where('cash_box_id', $box->id)
            ->where('direction', 'out')
            ->where('source', 'expense')
            // A month is YYYY-MM; without one the recent list is shown as before.
            ->when($month, fn ($q) => $q
                ->whereYear('created_at', (int) substr($month, 0, 4))
                ->whereMonth('created_at', (int) substr($month, 5, 2)))
            ->with(['actor', 'task'])
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (CashMovement $movement) => [
                'id' => $movement->id,
                'amount' => (float) $movement->amount,
                'category' => $movement->category,
                'note' => $movement->note,
                'task_id' => $movement->task_id,
                'task_code' => $movement->task?->code,
                'receipt_url' => $movement->receiptUrl(),
                'by' => $movement->actor?->name,
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

    /**
     * Custody may be entrusted to anyone on staff, whatever their role — a
     * driver, an accountant, an office manager — not only a field technician. The
     * one bar is a suspended account: money and devices are not handed to someone
     * whose access has been pulled.
     */
    protected function assertTechnician(User $user): void
    {
        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'user_id' => 'لا يمكن تسليم عهدة لمستخدم موقوف.',
            ]);
        }
    }
}
