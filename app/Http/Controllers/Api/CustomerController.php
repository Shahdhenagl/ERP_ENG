<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Models\ActivityLog;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CustomerController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $today = now()->toDateString();

        $customers = Customer::query()
            ->search($request->string('search')->toString())
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            // `active` as a tri-state: unset shows all, 1 active, 0 inactive.
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->ofType($request->string('type')->toString() ?: null)
            ->contractStanding($request->string('contract')->toString() ?: null)
            ->withCount([
                'tasks',
                'contracts',
                'contracts as active_contracts_count' => fn ($q) => $q->activeOn($today),
                'contracts as expiring_contracts_count' => fn ($q) => $q->expiringWithin(60),
            ])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 25));

        return CustomerResource::collection($customers);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()->id;


        $customer = Customer::create($data);

        ActivityLog::record('customer.created', $customer, "تم إضافة العميل {$customer->name}");

        return response()->json(new CustomerResource($customer), 201);
    }

    public function show(Customer $customer): CustomerResource
    {
        return new CustomerResource($customer->loadCount('tasks'));
    }

    /**
     * The customer's whole file on one screen: who they are, the cover they
     * hold, what has been quoted, the devices on site, and where the money
     * stands. Every figure is read from the module that owns it.
     */
    public function profile(Customer $customer): JsonResponse
    {
        $today = now()->toDateString();

        $customer->loadCount([
            'tasks',
            'assets',
            'contracts as active_contracts_count' => fn ($q) => $q->activeOn($today),
            'contracts as expiring_contracts_count' => fn ($q) => $q->expiringWithin(60),
            'contracts as contracts_count',
        ]);

        $contracts = $customer->contracts()
            ->with('customer')
            ->orderByDesc('ends_on')
            ->get()
            ->map(fn ($contract) => [
                'id' => $contract->id,
                'code' => $contract->code,
                'title' => $contract->label,
                'starts_on' => $contract->starts_on?->toDateString(),
                'ends_on' => $contract->ends_on?->toDateString(),
                'value' => (float) $contract->value,
                'status' => $contract->effectiveStatus(),
                'status_label' => $contract->effectiveStatusLabel(),
                'days_remaining' => $contract->daysRemaining(),
            ]);

        $quotations = $customer->quotations()
            ->orderByDesc('issue_date')
            ->limit(10)
            ->get()
            ->map(fn ($quotation) => [
                'id' => $quotation->id,
                'code' => $quotation->code,
                'title' => $quotation->title,
                'issue_date' => $quotation->issue_date?->toDateString(),
                'total' => (float) $quotation->total,
                'status' => $quotation->effectiveStatus(),
                'status_label' => $quotation->effectiveStatusLabel(),
            ]);

        $assets = $customer->assets()
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn ($asset) => [
                'id' => $asset->id,
                'code' => $asset->code,
                'label' => $asset->label(),
                'serial' => $asset->serial,
            ]);

        // What is owed: issued invoices, less what has been collected on them.
        $invoiced = (float) $customer->invoices()->where('status', 'issued')->sum('total');
        $collected = (float) DB::table('payments')
            ->whereIn('invoice_id', $customer->invoices()->select('id'))
            ->sum('amount');

        return response()->json([
            'data' => [
                'customer' => new CustomerResource($customer),
                'summary' => [
                    'contracts' => $customer->contracts_count,
                    'active_contracts' => $customer->active_contracts_count,
                    'expiring_contracts' => $customer->expiring_contracts_count,
                    'quotations' => $customer->quotations()->count(),
                    'assets' => $customer->assets_count,
                    'tasks' => $customer->tasks_count,
                    'outstanding' => round($invoiced - $collected, 2),
                ],
                'contracts' => $contracts,
                'quotations' => $quotations,
                'assets' => $assets,
            ],
        ]);
    }

    public function update(Request $request, Customer $customer): CustomerResource
    {
        $customer->update($this->validated($request, $customer));

        ActivityLog::record('customer.updated', $customer, "تم تعديل العميل {$customer->name}");

        return new CustomerResource($customer->fresh());
    }

    public function destroy(Customer $customer): JsonResponse
    {
        if ($customer->tasks()->open()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف عميل لديه مهام مفتوحة.',
            ], 422);
        }

        $name = $customer->name;
        $customer->delete();

        ActivityLog::record('customer.deleted', $customer, "تم حذف العميل {$name}");

        return response()->json(['message' => 'تم حذف العميل.']);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?Customer $customer = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'company' => ['nullable', 'string', 'max:160'],
            'type' => ['nullable', Rule::in(array_keys(Customer::TYPES))],
            // Unique across customers — one number, one file. On edit the
            // customer's own row is excused so re-saving is not blocked.
            'phone' => [
                'required', 'string', 'max:32',
                Rule::unique('customers', 'phone')->ignore($customer?->id)->withoutTrashed(),
            ],
            'whatsapp' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:160'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:80'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'map_url' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ]);
    }
}
