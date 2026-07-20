<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Http\Controllers\Controller;
use App\Http\Resources\TaskResource;
use App\Models\ActivityLog;
use App\Models\Asset;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use App\Services\TaskWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TaskController extends Controller
{
    public function __construct(protected TaskWorkflow $workflow) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $tasks = Task::query()
            ->with(['customer', 'technician', 'creator', 'asset'])
            // Technicians only ever see their own work.
            ->when($user->isTechnician(), fn ($q) => $q->forTechnician($user->id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('open_only'), fn ($q) => $q->open())
            ->when($request->string('type')->toString(), fn ($q, $t) => $q->where('type', $t))
            ->when($request->string('priority')->toString(), fn ($q, $p) => $q->where('priority', $p))
            ->when($request->integer('assigned_to'), fn ($q, $id) => $q->where('assigned_to', $id))
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->integer('contract_id'), fn ($q, $id) => $q->where('contract_id', $id))
            ->when($request->boolean('contract_only'), fn ($q) => $q->whereNotNull('contract_id'))
            ->when($request->string('scheduled_after')->toString(), fn ($q, $d) => $q->whereDate('scheduled_at', '>=', $d))
            ->when($request->string('scheduled_before')->toString(), fn ($q, $d) => $q->whereDate('scheduled_at', '<=', $d))
            ->search($request->string('search')->toString())
            ->orderByRaw("FIELD(priority, 'urgent','high','normal','low')")
            ->orderByRaw('scheduled_at IS NULL, scheduled_at ASC')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 20));

        return TaskResource::collection($tasks);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'assigned_to' => ['nullable', 'exists:users,id'],
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:5000'],
            'type' => ['required', Rule::enum(TaskType::class)],
            'priority' => ['required', Rule::enum(TaskPriority::class)],
            'site_address' => ['nullable', 'string', 'max:500'],
            'site_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'site_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'site_map_url' => ['nullable', 'string', 'max:1000'],
            'asset_id' => ['nullable', 'exists:assets,id'],
            'scheduled_at' => ['nullable', 'date'],
        ]);

        $this->assertAssetBelongsToCustomer($data);

        $data['created_by'] = $request->user()->id;
        $data['status'] = TaskStatus::Pending;

        // Inherit the customer's location when the manager did not override it,
        // so the technician always gets a usable destination.
        if (blank($data['site_address'] ?? null) && blank($data['site_lat'] ?? null)) {
            $customer = Customer::find($data['customer_id']);
            $data['site_address'] = $customer?->address;
            $data['site_lat'] = $customer?->lat;
            $data['site_lng'] = $customer?->lng;
            $data['site_map_url'] = $customer?->map_url;
        }

        $assignee = $data['assigned_to'] ?? null;
        unset($data['assigned_to']);

        $task = Task::create($data);

        ActivityLog::record('task.created', $task, "تم إنشاء المهمة {$task->code}");

        // Assign through the workflow so the technician gets notified.
        if ($assignee && $technician = User::find($assignee)) {
            $task = $this->workflow->assign($task, $technician, $request->user());
        }

        return response()->json(
            new TaskResource($task->load(['customer', 'technician', 'creator', 'asset'])),
            201,
        );
    }

    public function show(Request $request, Task $task): TaskResource
    {
        $this->authorizeView($request, $task);

        return new TaskResource($task->load([
            'customer',
            'technician',
            'creator',
            'asset',
            'contract',
            'statusLogs.user',
            'reports.author',
            'reports.attachments',
            'attachments.uploader',
        ]));
    }

    public function update(Request $request, Task $task): TaskResource
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:5000'],
            'type' => ['required', Rule::enum(TaskType::class)],
            'priority' => ['required', Rule::enum(TaskPriority::class)],
            'customer_id' => ['required', 'exists:customers,id'],
            'site_address' => ['nullable', 'string', 'max:500'],
            'site_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'site_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'site_map_url' => ['nullable', 'string', 'max:1000'],
            'asset_id' => ['nullable', 'exists:assets,id'],
            'scheduled_at' => ['nullable', 'date'],
        ]);

        $this->assertAssetBelongsToCustomer($data);

        $task->update($data);

        ActivityLog::record('task.updated', $task, "تم تعديل المهمة {$task->code}");

        return new TaskResource($task->fresh(['customer', 'technician', 'creator', 'asset']));
    }

    /**
     * A job may only point at a device the same customer owns. Without this,
     * picking an id by hand would attach one customer's unit to another's job
     * and quietly corrupt that device's service history.
     *
     * @param  array<string, mixed>  $data
     */
    protected function assertAssetBelongsToCustomer(array $data): void
    {
        if (empty($data['asset_id'])) {
            return;
        }

        $owner = Asset::whereKey($data['asset_id'])->value('customer_id');

        if ((int) $owner !== (int) $data['customer_id']) {
            throw ValidationException::withMessages([
                'asset_id' => 'الجهاز المحدد لا يخص هذا العميل.',
            ]);
        }
    }

    /** Assign or reassign the job to a technician. */
    public function assign(Request $request, Task $task): TaskResource
    {
        $data = $request->validate([
            'assigned_to' => ['nullable', 'exists:users,id'],
        ]);

        $technician = $data['assigned_to'] ? User::find($data['assigned_to']) : null;

        if ($technician && ! $technician->isTechnician()) {
            throw ValidationException::withMessages([
                'assigned_to' => 'يجب اختيار مستخدم بدور «فني».',
            ]);
        }

        if ($technician && ! $technician->is_active) {
            throw ValidationException::withMessages([
                'assigned_to' => 'هذا الفني موقوف ولا يمكن إسناد مهام إليه.',
            ]);
        }

        $task = $this->workflow->assign($task, $technician, $request->user());

        return new TaskResource($task);
    }

    public function destroy(Task $task): JsonResponse
    {
        $code = $task->code;
        $task->delete();

        ActivityLog::record('task.deleted', $task, "تم حذف المهمة {$code}");

        return response()->json(['message' => 'تم حذف المهمة.']);
    }

    /** A technician may only open a job assigned to them. */
    protected function authorizeView(Request $request, Task $task): void
    {
        $user = $request->user();

        abort_if(
            $user->isTechnician() && $task->assigned_to !== $user->id,
            403,
            'هذه المهمة غير مسندة إليك.',
        );
    }
}
