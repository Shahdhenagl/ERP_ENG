<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Models\ActivityLog;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CustomerController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $customers = Customer::query()
            ->search($request->string('search')->toString())
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->withCount('tasks')
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

    public function update(Request $request, Customer $customer): CustomerResource
    {
        $customer->update($this->validated($request));

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
    protected function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'company' => ['nullable', 'string', 'max:160'],
            'phone' => ['required', 'string', 'max:32'],
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
