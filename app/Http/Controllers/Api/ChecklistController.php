<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\ChecklistItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The periodic-maintenance checklist template. Read by anyone signed in — the
 * technician needs the list on site — but only the manager may change it.
 */
class ChecklistController extends Controller
{
    /** The active checklist, in order — what a technician fills on a visit. */
    public function index(Request $request): JsonResponse
    {
        $items = ChecklistItem::query()
            ->when(! $request->boolean('all'), fn ($q) => $q->active())
            ->ordered()
            ->get()
            ->map(fn (ChecklistItem $item) => $this->present($item));

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['sort_order'] ??= (int) ChecklistItem::max('sort_order') + 1;

        $item = ChecklistItem::create($data);

        ActivityLog::record('checklist.item_added', null, "بند فحص: {$item->label}");

        return response()->json(['data' => $this->present($item)], 201);
    }

    public function update(Request $request, ChecklistItem $checklistItem): JsonResponse
    {
        $checklistItem->update($this->validated($request));

        return response()->json(['data' => $this->present($checklistItem->fresh())]);
    }

    public function destroy(ChecklistItem $checklistItem): JsonResponse
    {
        $checklistItem->delete();

        return response()->json(['deleted' => true]);
    }

    /** @return array<string, mixed> */
    protected function present(ChecklistItem $item): array
    {
        return [
            'id' => $item->id,
            'label' => $item->label,
            'sort_order' => $item->sort_order,
            'is_active' => $item->is_active,
        ];
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'label' => ['required', 'string', 'max:200'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'is_active' => ['boolean'],
        ]);
    }
}
