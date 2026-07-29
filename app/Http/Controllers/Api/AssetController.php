<?php

namespace App\Http\Controllers\Api;

use App\Enums\ItemCategory;
use App\Http\Controllers\Controller;
use App\Http\Resources\AssetResource;
use App\Models\ActivityLog;
use App\Models\Asset;
use App\Models\Item;
use App\Models\Warehouse;
use App\Services\StockLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AssetController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $assets = Asset::query()
            ->search($request->string('search')->toString())
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            // The customer's file lists its devices site by site.
            ->when($request->integer('branch_id'), fn ($q, $id) => $q->where('branch_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->when($request->boolean('under_warranty'), fn ($q) => $q->underWarranty())
            ->with(['customer', 'branch'])
            ->withCount('tasks')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 25));

        return AssetResource::collection($assets);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()->id;

        // A unit drawn from stock carries the catalogue nameplate down and comes
        // off the shelf in the same transaction — the register and the balance
        // move together or neither does.
        $asset = DB::transaction(function () use ($data, $request) {
            $item = null;

            if (! empty($data['item_id'])) {
                $item = Item::findOrFail($data['item_id']);

                if ($item->category !== ItemCategory::Ups) {
                    throw ValidationException::withMessages([
                        'item_id' => 'الصنف المختار ليس جهاز UPS.',
                    ]);
                }

                // Fill only the blanks, so a serial or note the caller typed wins
                // over the shared nameplate.
                foreach (($item->specs ?? []) as $key => $value) {
                    if (empty($data[$key])) {
                        $data[$key] = $value;
                    }
                }
                $data['name'] ??= $item->name;
            }

            $asset = Asset::create($data);

            if ($item) {
                app(StockLedger::class)->issue(
                    $item,
                    Warehouse::main(),
                    1,
                    $request->user(),
                    "تركيب جهاز {$asset->code} عند العميل",
                );
            }

            return $asset;
        });

        ActivityLog::record('asset.created', $asset, "تم تسجيل الجهاز {$asset->code}");

        return response()->json(new AssetResource($asset->load('customer')), 201);
    }

    public function show(Request $request, Asset $asset): AssetResource
    {
        // Technicians reach this route too. Without a check they could walk the
        // id space and read every customer's equipment, so limit them to units
        // they have actually been dispatched to.
        $user = $request->user();

        if ($user->isTechnician() && ! $asset->tasks()->where('assigned_to', $user->id)->exists()) {
            abort(403, 'هذا الجهاز خارج نطاق مهامك.');
        }

        // The service history is the reason this page exists, so it is always
        // loaded rather than left to a second request.
        return new AssetResource(
            $asset->load([
                'customer',
                'tasks' => fn ($q) => $q->with('technician')->orderByDesc('scheduled_at'),
            ])->loadCount('tasks'),
        );
    }

    public function update(Request $request, Asset $asset): AssetResource
    {
        $asset->update($this->validated($request, $asset));

        ActivityLog::record('asset.updated', $asset, "تم تعديل الجهاز {$asset->code}");

        return new AssetResource($asset->fresh()->load('customer'));
    }

    public function destroy(Asset $asset): JsonResponse
    {
        if ($asset->tasks()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف جهاز مرتبط بمهام. غيّر حالته إلى «خارج الخدمة» بدلًا من ذلك.',
            ], 422);
        }

        $code = $asset->code;
        $asset->delete();

        ActivityLog::record('asset.deleted', $asset, "تم حذف الجهاز {$code}");

        return response()->json(['message' => 'تم حذف الجهاز.']);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?Asset $asset = null): array
    {
        $data = $request->validate([
            'serial' => [
                'nullable', 'string', 'max:120',
                Rule::unique('assets')->ignore($asset?->id)->whereNull('deleted_at'),
            ],
            'customer_id' => ['required', 'exists:customers,id'],
            // The catalogue UPS this unit is drawn from — one comes off the shelf
            // when it is set. Only meaningful on a new record.
            'item_id' => ['nullable', 'exists:items,id'],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'name' => ['nullable', 'string', 'max:160'],
            'asset_number' => ['nullable', 'string', 'max:64'],
            'barcode' => ['nullable', 'string', 'max:120'],
            'brand' => ['nullable', 'string', 'max:120'],
            'model' => ['nullable', 'string', 'max:120'],
            'ups_type' => ['nullable', 'in:online,offline,line_interactive'],
            'phase' => ['nullable', 'in:single,three'],
            'capacity' => ['nullable', 'string', 'max:64'],

            // Technical specifications — the nameplate, kept as text so a range
            // like "160–290V" survives as written.
            'input_voltage' => ['nullable', 'string', 'max:60'],
            'output_voltage' => ['nullable', 'string', 'max:60'],
            'frequency' => ['nullable', 'string', 'max:40'],
            'efficiency' => ['nullable', 'string', 'max:40'],
            'power_factor' => ['nullable', 'string', 'max:20'],
            'battery_voltage' => ['nullable', 'string', 'max:40'],
            'battery_count' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'backup_minutes' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'comm_port' => ['nullable', 'string', 'max:60'],

            'site_address' => ['nullable', 'string', 'max:500'],
            'site_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'site_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'sold_at' => ['nullable', 'date'],
            'warranty_months' => ['nullable', 'integer', 'min:0', 'max:600'],
            'installed_at' => ['nullable', 'date'],
            'status' => ['nullable', Rule::enum(\App\Enums\AssetStatus::class)],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        // A device may only sit at a site its own owner has. Otherwise picking
        // an id by hand would file one customer's unit under another's branch,
        // and that branch's device list would stop being true.
        if (! empty($data['branch_id'])) {
            $owner = \App\Models\Branch::whereKey($data['branch_id'])->value('customer_id');

            if ((int) $owner !== (int) $data['customer_id']) {
                throw ValidationException::withMessages([
                    'branch_id' => 'الفرع المحدد لا يخص هذا العميل.',
                ]);
            }
        }

        return $data;
    }
}
