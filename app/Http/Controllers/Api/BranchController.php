<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    /** Every branch, for a picker that spans customers. */
    public function index(Request $request): JsonResponse
    {
        $branches = Branch::query()
            ->search($request->string('search')->toString())
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->with('customer')
            ->withCount(['assets', 'tasks'])
            ->orderBy('customer_id')
            ->orderBy('name')
            ->get()
            ->map(fn (Branch $branch) => $this->present($branch));

        return response()->json(['data' => $branches]);
    }

    /** The branches of one customer — what the customer screen lists. */
    public function forCustomer(Customer $customer): JsonResponse
    {
        $branches = $customer->branches()
            ->withCount(['assets', 'tasks'])
            ->orderBy('name')
            ->get()
            ->map(fn (Branch $branch) => $this->present($branch));

        return response()->json(['data' => $branches]);
    }

    public function store(Request $request, Customer $customer): JsonResponse
    {
        $branch = $customer->branches()->create([
            ...$this->validated($request),
            'created_by' => $request->user()->id,
        ]);

        ActivityLog::record(
            'branch.created',
            $branch,
            "تم إضافة فرع {$branch->name} للعميل {$customer->name}",
        );

        return response()->json(['data' => $this->present($branch->load('customer'))], 201);
    }

    public function show(Branch $branch): JsonResponse
    {
        return response()->json([
            'data' => $this->present($branch->load('customer')->loadCount(['assets', 'tasks'])),
        ]);
    }

    public function update(Request $request, Branch $branch): JsonResponse
    {
        $branch->update($this->validated($request));

        ActivityLog::record('branch.updated', $branch, "تم تعديل فرع {$branch->name}");

        return response()->json(['data' => $this->present($branch->fresh()->load('customer'))]);
    }

    public function destroy(Branch $branch): JsonResponse
    {
        // Deleting would orphan the devices' location history, and the job
        // records would point at a site that no longer exists.
        if ($branch->assets()->exists() || $branch->tasks()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف فرع به أجهزة أو مهام. أوقفه بدلًا من ذلك.',
            ], 422);
        }

        $name = $branch->name;
        $branch->delete();

        ActivityLog::record('branch.deleted', $branch, "تم حذف فرع {$name}");

        return response()->json(['message' => 'تم حذف الفرع.']);
    }

    /* ── Helpers ─────────────────────────────────────────── */

    protected function present(Branch $branch): array
    {
        return [
            'id' => $branch->id,
            'code' => $branch->code,
            'customer_id' => $branch->customer_id,
            'customer' => $branch->customer?->name,

            'name' => $branch->name,
            'label' => $branch->label(),
            'customer_ref' => $branch->customer_ref,

            'address' => $branch->address,
            'city' => $branch->city,
            'lat' => $branch->lat,
            'lng' => $branch->lng,
            'map_url' => $branch->map_url,
            'maps_url' => $branch->mapsUrl(),

            'contact_name' => $branch->contact_name,
            'contact_phone' => $branch->contact_phone,
            'contact_whatsapp' => $branch->contact_whatsapp,
            'contact_number' => $branch->contactNumber(),

            'working_hours' => $branch->working_hours,
            'notes' => $branch->notes,
            'is_active' => $branch->is_active,

            'assets_count' => $branch->assets_count ?? null,
            'tasks_count' => $branch->tasks_count ?? null,
        ];
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'customer_ref' => ['nullable', 'string', 'max:64'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:80'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'map_url' => ['nullable', 'string', 'max:1000'],
            'contact_name' => ['nullable', 'string', 'max:160'],
            'contact_phone' => ['nullable', 'string', 'max:32'],
            'contact_whatsapp' => ['nullable', 'string', 'max:32'],
            'working_hours' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ]);
    }
}
