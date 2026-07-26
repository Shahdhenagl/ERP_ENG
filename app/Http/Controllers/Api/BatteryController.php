<?php

namespace App\Http\Controllers\Api;

use App\Enums\ItemCategory;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Battery;
use App\Models\Item;
use App\Models\Warehouse;
use App\Services\StockLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BatteryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $batteries = Battery::query()
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->integer('asset_id'), fn ($q, $id) => $q->where('asset_id', $id))
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when(
                $request->has('due_within'),
                fn ($q) => $q->dueWithin($request->integer('due_within', 30)),
            )
            ->with(['asset', 'customer', 'replacement'])
            ->orderByRaw('DATE_ADD(installed_on, INTERVAL life_months MONTH) asc')
            ->get()
            ->map(fn (Battery $battery) => $this->present($battery));

        return response()->json([
            'data' => $batteries,
            'meta' => [
                // The count driving the badge — live banks due inside a month.
                'due_soon' => Battery::query()->dueWithin(30)->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()->id;

        // Drawn from stock: the bank carries the catalogue nameplate and price,
        // and its cells come off the shelf in the same transaction.
        $battery = DB::transaction(function () use ($data, $request) {
            $item = null;

            if (! empty($data['item_id'])) {
                $item = Item::findOrFail($data['item_id']);

                if ($item->category !== ItemCategory::Battery) {
                    throw ValidationException::withMessages([
                        'item_id' => 'الصنف المختار ليس بطارية.',
                    ]);
                }

                foreach (($item->specs ?? []) as $key => $value) {
                    if (empty($data[$key])) {
                        $data[$key] = $value;
                    }
                }
                $data['name'] ??= $item->name;
                $data['unit_cost'] ??= (float) $item->avg_cost;
                if (empty($data['sell_price']) && $item->sell_price !== null) {
                    $data['sell_price'] = (float) $item->sell_price;
                }
            }

            $battery = Battery::create($data);

            if ($item) {
                app(StockLedger::class)->issue(
                    $item,
                    Warehouse::main(),
                    max(1, (int) $battery->count),
                    $request->user(),
                    "تركيب بطارية {$battery->code} عند العميل",
                );
            }

            return $battery;
        });

        ActivityLog::record('battery.created', $battery, "تسجيل بطارية {$battery->code}");

        return response()->json(['data' => $this->present($battery->load(['asset', 'customer']))], 201);
    }

    public function update(Request $request, Battery $battery): JsonResponse
    {
        $battery->update($this->validated($request));

        return response()->json(['data' => $this->present($battery->fresh()->load(['asset', 'customer']))]);
    }

    /**
     * Change the bank: close this one and open its replacement, linked back.
     * The new bank inherits the unit and specs unless the caller overrides them,
     * and its clock starts today.
     */
    public function replace(Request $request, Battery $battery): JsonResponse
    {
        if ($battery->status !== \App\Enums\BatteryStatus::Active) {
            throw ValidationException::withMessages(['status' => 'هذه البطارية ليست قيد التشغيل.']);
        }

        $data = $request->validate([
            'installed_on' => ['nullable', 'date'],
            'serial_number' => ['nullable', 'string', 'max:120'],
            'life_months' => ['nullable', 'integer', 'min:1', 'max:600'],
            'warranty_months' => ['nullable', 'integer', 'min:0', 'max:600'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $fresh = DB::transaction(function () use ($battery, $data, $request) {
            $fresh = Battery::create([
                'asset_id' => $battery->asset_id,
                'customer_id' => $battery->customer_id,
                'serial_number' => $data['serial_number'] ?? null,
                'brand' => $battery->brand,
                'model' => $battery->model,
                'capacity_ah' => $battery->capacity_ah,
                'voltage' => $battery->voltage,
                'count' => $battery->count,
                'installed_on' => $data['installed_on'] ?? now()->toDateString(),
                'life_months' => $data['life_months'] ?? $battery->life_months,
                'warranty_months' => $data['warranty_months'] ?? $battery->warranty_months,
                'notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ]);

            $battery->update([
                'status' => \App\Enums\BatteryStatus::Replaced,
                'replaced_by_id' => $fresh->id,
                'replaced_on' => $fresh->installed_on,
            ]);

            return $fresh;
        });

        ActivityLog::record(
            'battery.replaced',
            $fresh,
            "استبدال بطارية {$battery->code} بـ {$fresh->code}",
        );

        return response()->json(['data' => $this->present($fresh->load(['asset', 'customer']))], 201);
    }

    public function destroy(Battery $battery): JsonResponse
    {
        $code = $battery->code;
        $battery->delete();

        ActivityLog::record('battery.deleted', $battery, "حذف بطارية {$code}");

        return response()->json(['message' => 'تم الحذف.']);
    }

    /** @return array<string, mixed> */
    protected function present(Battery $battery): array
    {
        $due = $battery->dueAt();
        $days = $battery->daysUntilDue();

        return [
            'id' => $battery->id,
            'code' => $battery->code,

            'item_id' => $battery->item_id,
            'asset_id' => $battery->asset_id,
            'asset' => $battery->asset?->code,
            'asset_label' => $battery->asset
                ? trim("{$battery->asset->brand} {$battery->asset->model}")
                : null,
            'customer_id' => $battery->customer_id,
            'customer' => $battery->customer?->name,

            'serial_number' => $battery->serial_number,
            'name' => $battery->name,
            'asset_tag' => $battery->asset_tag,
            'barcode' => $battery->barcode,
            'brand' => $battery->brand,
            'model' => $battery->model,
            'battery_type' => $battery->battery_type,
            'size' => $battery->size,
            'capacity_ah' => $battery->capacity_ah !== null ? (float) $battery->capacity_ah : null,
            'voltage' => $battery->voltage !== null ? (float) $battery->voltage : null,
            'energy_wh' => $battery->energy_wh,
            'count' => $battery->count,

            'terminal_type' => $battery->terminal_type,
            'internal_resistance' => $battery->internal_resistance,
            'weight' => $battery->weight,
            'dimensions' => $battery->dimensions,
            'operating_temperature' => $battery->operating_temperature,

            'unit_cost' => $battery->unit_cost !== null ? (float) $battery->unit_cost : null,
            'sell_price' => $battery->sell_price !== null ? (float) $battery->sell_price : null,

            'installed_on' => $battery->installed_on?->toDateString(),
            'life_months' => $battery->life_months,
            'warranty_months' => $battery->warranty_months,
            'due_at' => $due?->toDateString(),
            'days_until_due' => $days,
            'is_overdue' => $days !== null && $battery->status === \App\Enums\BatteryStatus::Active && $days < 0,

            'status' => $battery->status->value,
            'status_label' => $battery->statusLabel(),

            'replaced_by_id' => $battery->replaced_by_id,
            'replacement_code' => $battery->replacement?->code,
            'replaced_on' => $battery->replaced_on?->toDateString(),

            'notes' => $battery->notes,
            'created_at' => $battery->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'asset_id' => ['nullable', 'exists:assets,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            // The catalogue battery this bank is drawn from — its cells come off
            // the shelf when it is set.
            'item_id' => ['nullable', 'exists:items,id'],
            'serial_number' => ['nullable', 'string', 'max:120'],
            'name' => ['nullable', 'string', 'max:160'],
            'asset_tag' => ['nullable', 'string', 'max:64'],
            'barcode' => ['nullable', 'string', 'max:120'],
            'brand' => ['nullable', 'string', 'max:120'],
            'model' => ['nullable', 'string', 'max:120'],
            'battery_type' => ['nullable', 'in:vrla,agm,gel,lithium_ion'],
            'size' => ['nullable', 'string', 'max:60'],
            'capacity_ah' => ['nullable', 'numeric', 'min:0'],
            'voltage' => ['nullable', 'numeric', 'min:0'],
            'energy_wh' => ['nullable', 'string', 'max:40'],
            'count' => ['nullable', 'integer', 'min:1', 'max:1000'],

            // Technical, kept as text so a unit like "5.2 mΩ" survives.
            'terminal_type' => ['nullable', 'string', 'max:60'],
            'internal_resistance' => ['nullable', 'string', 'max:40'],
            'weight' => ['nullable', 'string', 'max:40'],
            'dimensions' => ['nullable', 'string', 'max:80'],
            'operating_temperature' => ['nullable', 'string', 'max:60'],

            'unit_cost' => ['nullable', 'numeric', 'min:0'],
            'sell_price' => ['nullable', 'numeric', 'min:0'],

            'installed_on' => ['nullable', 'date'],
            'life_months' => ['nullable', 'integer', 'min:1', 'max:600'],
            'warranty_months' => ['nullable', 'integer', 'min:0', 'max:600'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
    }
}
