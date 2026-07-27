<?php

namespace App\Http\Controllers\Api;

use App\Enums\ItemCategory;
use App\Http\Controllers\Controller;
use App\Http\Resources\ItemResource;
use App\Models\ActivityLog;
use App\Models\Item;
use App\Models\Warehouse;
use App\Services\StockLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class ItemController extends Controller
{
    public function __construct(protected StockLedger $stock) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        // The same filters the page is looking at, minus the category — the tabs
        // switch category, so their counts must not move when one is picked.
        $base = fn () => Item::query()
            ->search($request->string('search')->toString())
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->when($request->boolean('below_reorder'), fn ($q) => $q->belowReorderLevel());

        $items = $base()
            ->when($request->string('category')->toString(), fn ($q, $c) => $q->where('category', $c))
            ->with('levels.warehouse')
            ->orderBy('name')
            ->paginate($request->integer('per_page', 30));

        $counts = $base()
            ->selectRaw('category, count(*) as total')
            ->groupBy('category')
            ->pluck('total', 'category');

        return ItemResource::collection($items)->additional([
            'counts' => [
                'all' => (int) $counts->sum(),
                'by_category' => $counts->map(fn ($n) => (int) $n),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()->id;

        // What is already on the shelf the day the item is added to the system.
        // Taken here so nobody has to add the item and then remember to receive
        // it — but it still goes in as a receipt, never as a number written
        // onto the item, because a balance with no movement behind it cannot be
        // explained to anyone later.
        $opening = $request->validate([
            'opening_qty' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            // Required with a quantity: a receipt at no cost values the stock at
            // nothing and quietly drags the average down. Zero is allowed, but
            // it has to be said.
            'opening_cost' => ['required_with:opening_qty', 'nullable', 'numeric', 'min:0', 'max:99999999'],
            'opening_warehouse_id' => ['nullable', 'exists:warehouses,id'],
        ]);

        $qty = (float) ($opening['opening_qty'] ?? 0);

        // Cost is never typed onto the item itself: it is whatever the goods
        // actually cost when they were received. Seeding it by hand would
        // corrupt the average.
        $item = Item::create($data);

        if ($qty > 0) {
            $warehouse = ! empty($opening['opening_warehouse_id'])
                ? Warehouse::findOrFail($opening['opening_warehouse_id'])
                : Warehouse::main();

            $this->stock->receive(
                $item,
                $warehouse,
                $qty,
                (float) ($opening['opening_cost'] ?? 0),
                $request->user(),
                ['note' => 'رصيد افتتاحي'],
            );
        }

        ActivityLog::record('item.created', $item, "تم إضافة الصنف {$item->name}");

        return response()->json(new ItemResource($item->fresh()->load('levels.warehouse')), 201);
    }

    public function show(Item $item): ItemResource
    {
        return new ItemResource($item->load('levels.warehouse'));
    }

    public function update(Request $request, Item $item): ItemResource
    {
        $item->update($this->validated($request, $item));

        ActivityLog::record('item.updated', $item, "تم تعديل الصنف {$item->name}");

        return new ItemResource($item->fresh()->load('levels.warehouse'));
    }

    public function destroy(Item $item): JsonResponse
    {
        if ($item->movements()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف صنف له حركة مخزنية. أوقفه بدلًا من ذلك.',
            ], 422);
        }

        $name = $item->name;
        $item->delete();

        ActivityLog::record('item.deleted', $item, "تم حذف الصنف {$name}");

        return response()->json(['message' => 'تم حذف الصنف.']);
    }

    /**
     * The nameplate fields the form collects, per kind. Only these keys are
     * kept, so an item can never carry a spec that belongs to another category.
     *
     * @var array<string, list<string>>
     */
    protected const SPEC_KEYS = [
        'ups' => [
            'brand', 'model', 'ups_type', 'phase', 'capacity', 'input_voltage',
            'output_voltage', 'frequency', 'efficiency', 'power_factor',
            'battery_voltage', 'battery_count', 'backup_minutes', 'comm_port',
        ],
        'battery' => [
            'brand', 'model', 'battery_type', 'size', 'capacity_ah', 'voltage',
            'energy_wh', 'terminal_type', 'internal_resistance', 'weight',
            'dimensions', 'operating_temperature',
        ],
    ];

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?Item $item = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'sku' => [
                'nullable', 'string', 'max:64',
                Rule::unique('items')->ignore($item?->id)->whereNull('deleted_at'),
            ],
            // What the scanner reads. Separate from `sku`, which is the
            // supplier's own number for the same thing.
            'barcode' => [
                'nullable', 'string', 'max:64',
                Rule::unique('items')->ignore($item?->id)->whereNull('deleted_at'),
            ],
            'category' => ['required', Rule::enum(ItemCategory::class)],
            'unit' => ['required', 'string', 'max:24'],
            'tracks_serials' => ['boolean'],
            'sell_price' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'reorder_level' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'specs' => ['nullable', 'array'],
            'specs.*' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ]);

        // A part carries no nameplate; a UPS keeps only UPS keys, a battery only
        // battery keys. Anything else the client sent is dropped, and an all-empty
        // nameplate is stored as null rather than a bag of blanks.
        $allowed = self::SPEC_KEYS[$data['category']] ?? [];
        $specs = array_filter(
            array_intersect_key($data['specs'] ?? [], array_flip($allowed)),
            fn ($value) => $value !== null && $value !== '',
        );
        $data['specs'] = $specs ?: null;

        return $data;
    }
}
