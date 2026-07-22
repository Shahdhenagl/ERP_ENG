<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\ItemCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ItemCategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $categories = ItemCategory::query()
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->withCount('items')
            ->orderBy('sort')
            ->orderBy('name')
            ->get()
            ->map(fn (ItemCategory $category) => $this->present($category));

        return response()->json(['data' => $categories]);
    }

    public function store(Request $request): JsonResponse
    {
        $category = ItemCategory::create($this->validated($request));

        ActivityLog::record('item.created', $category, "مجموعة أصناف جديدة: {$category->name}");

        return response()->json(['data' => $this->present($category)], 201);
    }

    public function update(Request $request, ItemCategory $itemCategory): JsonResponse
    {
        $itemCategory->update($this->validated($request, $itemCategory));

        return response()->json(['data' => $this->present($itemCategory->fresh())]);
    }

    public function destroy(ItemCategory $itemCategory): JsonResponse
    {
        // Refused rather than cascaded: deleting a group would either orphan
        // every item in it or delete them, and neither is what "remove this
        // word from the list" means.
        if ($itemCategory->isInUse()) {
            return response()->json([
                'message' => 'لا يمكن حذف مجموعة تحتوي أصنافًا. أوقفها بدلًا من ذلك.',
            ], 422);
        }

        $itemCategory->delete();

        return response()->json(['message' => 'تم حذف المجموعة.']);
    }

    /** @return array<string, mixed> */
    protected function present(ItemCategory $category): array
    {
        return [
            'id' => $category->id,
            'name' => $category->name,
            'slug' => $category->slug,
            'colour' => $category->colour,
            'chip' => $category->chip(),
            'sort' => $category->sort,
            'is_active' => $category->is_active,
            'items_count' => $category->items_count ?? $category->items()->count(),
            // The three that were once fixed in code keep their slug, and that
            // is what stops them being deleted out from under an old filter.
            'is_system' => $category->slug !== null,
        ];
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?ItemCategory $category = null): array
    {
        return $request->validate([
            'name' => [
                'required', 'string', 'max:120',
                Rule::unique('item_categories')->ignore($category?->id),
            ],
            'colour' => ['nullable', 'in:amber,blue,emerald,violet,red,slate'],
            'sort' => ['nullable', 'integer', 'min:0', 'max:999'],
            'is_active' => ['boolean'],
        ]);
    }
}
