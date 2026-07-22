<?php

namespace App\Http\Controllers\Api;

use App\Enums\WarehouseType;
use App\Http\Controllers\Controller;
use App\Http\Resources\StockMovementResource;
use App\Models\Item;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\Supplier;
use App\Models\ActivityLog;
use App\Services\CustodyService;
use App\Services\PurchasingService;
use App\Services\StockLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class StockController extends Controller
{
    public function __construct(
        protected StockLedger $ledger,
        protected PurchasingService $purchasing,
        protected CustodyService $custody,
    ) {}

    /** Every stock location, with what each is holding. */
    public function warehouses(Request $request): JsonResponse
    {
        $user = $request->user();

        $warehouses = Warehouse::query()
            ->with('holder')
            // A technician has no business reading another technician's custody.
            ->when($user->isTechnician(), fn ($q) => $q->where('user_id', $user->id))
            ->withSum('levels as total_qty', 'qty')
            ->orderBy('type')
            ->get()
            ->map(fn (Warehouse $w) => [
                'id' => $w->id,
                'name' => $w->name,
                'type' => $w->type->value,
                'type_label' => $w->type->label(),
                'holder' => $w->holder?->name,
                'is_default' => $w->is_default,
                'address' => $w->address,
                'keeper' => $w->keeper,
                'total_qty' => (float) ($w->total_qty ?? 0),
            ]);

        return response()->json(['data' => $warehouses]);
    }

    /** What the signed-in technician is carrying — the report's part picker. */
    public function myStock(Request $request): JsonResponse
    {
        $warehouse = Warehouse::forTechnician($request->user());

        $rows = $warehouse->levels()
            ->with('item')
            ->where('qty', '>', 0)
            ->get()
            ->map(fn ($level) => [
                'item_id' => $level->item_id,
                'name' => $level->item->name,
                'unit' => $level->item->unit,
                'category' => $level->item->category->value,
                'qty' => (float) $level->qty,
            ])
            ->values();

        return response()->json([
            'data' => $rows,
            'meta' => ['warehouse_id' => $warehouse->id, 'warehouse' => $warehouse->name],
        ]);
    }

    public function movements(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $movements = StockMovement::query()
            ->with(['item', 'from', 'to', 'task', 'actor'])
            ->when($request->integer('item_id'), fn ($q, $id) => $q->where('item_id', $id))
            ->when($request->integer('warehouse_id'), fn ($q, $id) => $q->where(
                fn ($w) => $w->where('from_warehouse_id', $id)->orWhere('to_warehouse_id', $id),
            ))
            ->when($request->string('type')->toString(), fn ($q, $t) => $q->where('type', $t))
            ->when($user->isTechnician(), function ($q) use ($user) {
                $van = Warehouse::where('user_id', $user->id)->value('id');

                $q->where(fn ($w) => $w->where('from_warehouse_id', $van)->orWhere('to_warehouse_id', $van));
            })
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return StockMovementResource::collection($movements);
    }

    /**
     * Goods in with no order behind them. The only thing that moves an item's
     * cost, and the supplier is a record rather than typed text — otherwise the
     * same company gets spelled three ways and nothing totals against them.
     */
    public function receive(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id' => ['required', 'exists:items,id'],
            'supplier_id' => ['required', 'exists:suppliers,id'],
            'qty' => ['required', 'numeric', 'gt:0'],
            'unit_cost' => ['required', 'numeric', 'min:0'],
            'reference' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:1000'],
            // Required by the ledger for a tracked item, refused as a count
            // mismatch if they do not line up with the quantity.
            'serials' => ['nullable', 'array'],
            'serials.*' => ['string', 'max:64'],
        ]);

        $movement = $this->purchasing->receiveDirect(
            Supplier::findOrFail($data['supplier_id']),
            Item::findOrFail($data['item_id']),
            (float) $data['qty'],
            (float) $data['unit_cost'],
            $request->user(),
            $data,
        );

        return response()->json(
            new StockMovementResource($movement->load(['item', 'to', 'actor'])),
            201,
        );
    }

    /** Hand stock to a technician, or take it back. */
    public function transfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id' => ['required', 'exists:items,id'],
            'qty' => ['required', 'numeric', 'gt:0'],
            'to_user_id' => ['required_without:to_main', 'nullable', 'exists:users,id'],
            'to_main' => ['boolean'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $item = Item::findOrFail($data['item_id']);
        $main = Warehouse::main();

        if ($request->boolean('to_main')) {
            // Coming back off a van: the technician is named as the source.
            $technician = User::findOrFail($data['to_user_id']);
            $from = Warehouse::forTechnician($technician);
            $to = $main;
        } else {
            $technician = User::findOrFail($data['to_user_id']);

            abort_unless($technician->isTechnician(), 422, 'العهدة تُسلَّم لفني فقط.');

            $from = $main;
            $to = Warehouse::forTechnician($technician);
        }

        $movement = $this->ledger->transfer(
            $item,
            $from,
            $to,
            (float) $data['qty'],
            $request->user(),
            $data['note'] ?? null,
        );

        return response()->json(
            new StockMovementResource($movement->load(['item', 'from', 'to', 'actor'])),
            201,
        );
    }

    /** Stocktake: the counted figure replaces the book figure. */
    public function adjust(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id' => ['required', 'exists:items,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'counted_qty' => ['required', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $movement = $this->ledger->adjust(
            Item::findOrFail($data['item_id']),
            Warehouse::findOrFail($data['warehouse_id']),
            (float) $data['counted_qty'],
            $request->user(),
            $data['note'] ?? null,
        );

        if (! $movement) {
            return response()->json(['message' => 'الجرد مطابق للرصيد — لم تُسجَّل أي حركة.']);
        }

        return response()->json(
            new StockMovementResource($movement->load(['item', 'from', 'to', 'actor'])),
            201,
        );
    }

    /** Headline numbers for the inventory dashboard card. */
    public function summary(): JsonResponse
    {
        $items = Item::query()->active()->with('levels')->get();

        return response()->json([
            'items_count' => $items->count(),
            'stock_value' => round($items->sum(fn (Item $i) => $i->stockValue()), 2),
            'below_reorder' => Item::query()->active()->belowReorderLevel()->count(),
            'vans' => Warehouse::where('type', WarehouseType::Van)->count(),
            'stores' => Warehouse::where('type', WarehouseType::Store)->count(),
        ]);
    }

    /* ── Stores ──────────────────────────────────────────── */
    // Kept here rather than in a controller of their own: a store is a place
    // in the same ledger, and splitting it off would split its guards too.

    public function storeWarehouse(Request $request): JsonResponse
    {
        $warehouse = $this->custody->openStore($this->validatedWarehouse($request));

        ActivityLog::record('warehouse.created', $warehouse, "تم فتح مخزن {$warehouse->name}");

        return response()->json(['data' => ['id' => $warehouse->id, 'name' => $warehouse->name]], 201);
    }

    public function updateWarehouse(Request $request, Warehouse $warehouse): JsonResponse
    {
        $warehouse->update([
            ...$this->validatedWarehouse($request),
            'is_active' => $request->boolean('is_active', true),
        ]);

        if ($request->boolean('make_default')) {
            $warehouse->makeDefault();
        }

        return response()->json(['data' => ['id' => $warehouse->id]]);
    }

    public function destroyWarehouse(Warehouse $warehouse): JsonResponse
    {
        $this->custody->closeStore($warehouse);

        ActivityLog::record('warehouse.deleted', null, "تم حذف مخزن {$warehouse->name}");

        return response()->json(['message' => 'تم حذف المخزن.']);
    }

    /** @return array<string, mixed> */
    protected function validatedWarehouse(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:500'],
            'keeper' => ['nullable', 'string', 'max:160'],
        ]);
    }
}
