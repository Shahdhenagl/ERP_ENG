<?php

namespace App\Http\Controllers\Api;

use App\Enums\ItemCategory;
use App\Http\Controllers\Controller;
use App\Http\Resources\ItemResource;
use App\Models\ActivityLog;
use App\Models\Item;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class ItemController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $items = Item::query()
            ->search($request->string('search')->toString())
            ->when($request->string('category')->toString(), fn ($q, $c) => $q->where('category', $c))
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->when($request->boolean('below_reorder'), fn ($q) => $q->belowReorderLevel())
            ->with('levels.warehouse')
            ->orderBy('name')
            ->paginate($request->integer('per_page', 30));

        return ItemResource::collection($items);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()->id;

        // Cost is never typed in: it is whatever the goods actually cost when
        // they were received. Seeding it by hand would corrupt the average.
        $item = Item::create($data);

        ActivityLog::record('item.created', $item, "تم إضافة الصنف {$item->name}");

        return response()->json(new ItemResource($item->load('levels.warehouse')), 201);
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

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?Item $item = null): array
    {
        return $request->validate([
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
            'reorder_level' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ]);
    }
}
