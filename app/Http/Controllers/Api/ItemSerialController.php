<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Item;
use App\Models\ItemSerial;
use App\Services\SerialRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ItemSerialController extends Controller
{
    public function __construct(protected SerialRegistry $registry) {}

    /** Every unit of one item, with where each has got to. */
    public function index(Request $request, Item $item): JsonResponse
    {
        $serials = $item->serials()
            ->search($request->string('search')->toString() ?: null)
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('available'), fn ($q) => $q->available())
            ->with(['warehouse', 'asset', 'issuedOn.task'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 50));

        return response()->json([
            'data' => $serials->through(fn (ItemSerial $unit) => $this->present($unit))->items(),
            'meta' => [
                'total' => $serials->total(),
                'last_page' => $serials->lastPage(),
                'in_stock' => $item->serials()->available()->count(),
            ],
        ]);
    }

    /**
     * Find a unit by its serial, across every item.
     *
     * This is what a scanner points at: someone holding a battery wants to know
     * what it is and where it has been, and they do not know which item record
     * it belongs to — that is the question, not the input.
     */
    public function lookup(Request $request): JsonResponse
    {
        $data = $request->validate(['serial' => ['required', 'string', 'max:64']]);

        $unit = ItemSerial::query()
            ->whereRaw('LOWER(serial) = ?', [mb_strtolower(trim($data['serial']))])
            ->with(['item', 'warehouse', 'asset', 'issuedOn.task', 'receivedOn'])
            ->first();

        if (! $unit) {
            return response()->json(['message' => 'لا يوجد رقم تسلسلي مطابق.'], 404);
        }

        return response()->json(['data' => $this->present($unit, detailed: true)]);
    }

    /** Take a unit out of circulation for good. */
    public function scrap(Request $request, ItemSerial $serial): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);

        $unit = $this->registry->scrap($serial, $data['reason']);

        ActivityLog::record(
            'stock.scrapped',
            $unit,
            "استبعاد الرقم التسلسلي {$unit->serial} — {$data['reason']}",
        );

        return response()->json(['data' => $this->present($unit->load('item'))]);
    }

    /** @return array<string, mixed> */
    protected function present(ItemSerial $unit, bool $detailed = false): array
    {
        return [
            'id' => $unit->id,
            'serial' => $unit->serial,
            'status' => $unit->status,
            'status_label' => $unit->statusLabel(),
            'is_available' => $unit->isAvailable(),

            'item_id' => $unit->item_id,
            'item' => $unit->item?->name,
            'item_code' => $unit->item?->code,

            'warehouse' => $unit->warehouse?->name,
            'asset_id' => $unit->asset_id,
            'asset' => $unit->asset?->label(),

            // Where it went, which is the whole point of tracking it.
            'issued_on_task' => $unit->issuedOn?->task?->code,
            'note' => $unit->note,

            ...$detailed ? [
                'received_at' => $unit->receivedOn?->created_at?->toDateString(),
                'received_from' => $unit->receivedOn?->supplier,
                'issued_at' => $unit->issuedOn?->created_at?->toDateString(),
            ] : [],

            'created_at' => $unit->created_at?->toIso8601String(),
        ];
    }
}
