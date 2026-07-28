<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\SalesReturn;
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

        return CustomerResource::collection($customers)->additional([
            'summary' => [
                'total' => Customer::count(),
                'active' => Customer::query()->active()->count(),
                'outstanding' => round(
                    (float) \App\Models\Invoice::where('status', 'issued')->sum('total')
                    - (float) \Illuminate\Support\Facades\DB::table('payments')->sum('amount'),
                    2,
                ),
            ],
        ]);
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

    /**
     * Every job for this customer over a date window — the maintenance history
     * a manager reads on the profile and prints for the customer.
     *
     * The window is applied to the effective date: when a job was scheduled, or
     * failing that when it was raised, so a job logged but not yet scheduled
     * still shows rather than falling through the filter.
     */
    public function tasks(Request $request, Customer $customer): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $effective = 'COALESCE(scheduled_at, created_at)';

        $query = $customer->tasks()
            ->with(['technician:id,name', 'branch:id,name', 'asset:id,code,brand,model'])
            ->when(
                $request->date('from'),
                fn ($q, $from) => $q->whereRaw("{$effective} >= ?", [$from->startOfDay()]),
            )
            ->when(
                $request->date('to'),
                fn ($q, $to) => $q->whereRaw("{$effective} <= ?", [$to->endOfDay()]),
            )
            ->orderByRaw("{$effective} desc");

        $tasks = $query->get();

        return response()->json([
            'data' => $tasks->map(fn ($task) => [
                'id' => $task->id,
                'code' => $task->code,
                'date' => ($task->scheduled_at ?? $task->created_at)?->toIso8601String(),
                'title' => $task->title,
                'description' => $task->description,
                'type' => $task->type->value,
                'type_label' => $task->type->label(),
                'status' => $task->status->value,
                'status_label' => $task->status->label(),
                'priority_label' => $task->priority->label(),
                'technician' => $task->technician?->name,
                'branch' => $task->branch?->name,
                'asset' => $task->asset?->label(),
                'completed_at' => $task->completed_at?->toIso8601String(),
            ]),
            'meta' => [
                'customer' => [
                    'id' => $customer->id,
                    'code' => $customer->code,
                    'name' => $customer->name,
                    'company' => $customer->company,
                    'phone' => $customer->phone,
                    'address' => $customer->address,
                ],
                'from' => $request->date('from')?->toDateString(),
                'to' => $request->date('to')?->toDateString(),
                'total' => $tasks->count(),
                'completed' => $tasks->where('status', \App\Enums\TaskStatus::Completed)->count(),
                // Everything still live — not finished and not called off.
                'open' => $tasks->whereNotIn('status', [
                    \App\Enums\TaskStatus::Completed,
                    \App\Enums\TaskStatus::Cancelled,
                ])->count(),
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
            'name_en' => ['nullable', 'string', 'max:160'],
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
            'tax_id' => ['nullable', 'string', 'max:32'],
            'commercial_register' => ['nullable', 'string', 'max:32'],
            'address' => ['nullable', 'string', 'max:500'],
            'governorate' => ['nullable', 'string', 'max:60'],
            'city' => ['nullable', 'string', 'max:80'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'map_url' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ]);
    }

    /**
     * One customer's whole dealing history, merged and read down the page.
     *
     * Quotes, invoices, receipts, credit notes, contracts and service tickets
     * are each pulled and folded into one date-sorted stream — the question
     * "everything we have ever done with them" answered in order, which no
     * single grouped list on the profile does.
     */
    public function timeline(Customer $customer): JsonResponse
    {
        $events = collect();

        foreach ($customer->quotations()->get() as $q) {
            $events->push($this->event($q->issue_date, 'quotation', 'عرض سعر', $q->code, $q->title, (float) $q->total, $q->effectiveStatusLabel()));
        }

        foreach ($customer->invoices()->where('status', '!=', 'draft')->get() as $i) {
            $events->push($this->event($i->issue_date, 'invoice', 'فاتورة', $i->code, null, (float) $i->total, $i->paymentStateLabel()));
        }

        foreach (Payment::where('customer_id', $customer->id)->with('invoice')->get() as $p) {
            $events->push($this->event($p->paid_at, 'payment', 'تحصيل', $p->code, $p->invoice?->code, (float) $p->amount, null));
        }

        foreach (SalesReturn::where('customer_id', $customer->id)->posted()->get() as $r) {
            $events->push($this->event($r->return_date, 'return', 'مرتجع', $r->code, null, (float) $r->total, null));
        }

        foreach ($customer->contracts()->get() as $c) {
            $events->push($this->event($c->starts_on, 'contract', 'عقد صيانة', $c->code, $c->label, (float) $c->value, $c->effectiveStatusLabel()));
        }

        foreach ($customer->tasks()->get() as $t) {
            $events->push($this->event($t->created_at, 'task', 'تذكرة صيانة', $t->code, $t->title, null, $t->status->label()));
        }

        $rows = $events
            ->filter(fn ($e) => $e['date'] !== null)
            ->sortByDesc('date')
            ->values();

        return response()->json([
            'data' => $rows,
            'meta' => [
                'customer' => [
                    'id' => $customer->id, 'name' => $customer->name, 'code' => $customer->code,
                    'company' => $customer->company, 'phone' => $customer->phone,
                    'address' => $customer->address,
                ],
                'total' => $rows->count(),
            ],
        ]);
    }

    /** @return array<string, mixed> */
    protected function event(mixed $date, string $type, string $typeLabel, ?string $code, ?string $title, ?float $amount, ?string $status): array
    {
        return [
            'date' => $date ? (string) (is_string($date) ? substr($date, 0, 10) : $date->toDateString()) : null,
            'type' => $type,
            'type_label' => $typeLabel,
            'code' => $code,
            'title' => $title,
            'amount' => $amount,
            'status' => $status,
        ];
    }
}
