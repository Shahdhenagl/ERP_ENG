<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Http\Controllers\Controller;
use App\Http\Resources\TaskResource;
use App\Models\ActivityLog;
use App\Models\Asset;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use App\Services\TaskWorkflow;
use App\Support\Terms;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
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
            ->with(['customer', 'branch', 'technicians', 'creator', 'asset'])
            // Technicians only ever see their own work.
            ->when($user->isTechnician(), fn ($q) => $q->forTechnician($user->id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('open_only'), fn ($q) => $q->open())
            ->when($request->string('type')->toString(), fn ($q, $t) => $q->where('type', $t))
            ->when($request->string('priority')->toString(), fn ($q, $p) => $q->where('priority', $p))
            ->when($request->integer('assigned_to'), fn ($q, $id) => $q->forTechnician($id))
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->integer('branch_id'), fn ($q, $id) => $q->where('branch_id', $id))
            ->when($request->integer('contract_id'), fn ($q, $id) => $q->where('contract_id', $id))
            ->when($request->boolean('contract_only'), fn ($q) => $q->whereNotNull('contract_id'))
            ->when($request->boolean('unassigned'), fn ($q) => $q->doesntHave('technicians'))
            ->when($request->boolean('overdue'), fn ($q) => $q->whereNotNull('scheduled_at')->where('scheduled_at', '<', now()))
            ->when($request->boolean('completed_today'), fn ($q) => $q->whereDate('completed_at', today()))
            ->when($request->boolean('completed_this_month'), fn ($q) => $q->whereBetween('completed_at', [now()->startOfMonth(), now()->endOfMonth()]))
            ->when($request->string('scheduled_after')->toString(), fn ($q, $d) => $q->whereDate('scheduled_at', '>=', $d))
            ->when($request->string('scheduled_before')->toString(), fn ($q, $d) => $q->whereDate('scheduled_at', '<=', $d))
            ->search($request->string('search')->toString())
            // The work list is a timeline: the latest visit/creation appears
            // first, regardless of its status or priority. This keeps newly
            // scheduled and recently created tasks visible at the top.
            ->orderByRaw('COALESCE(scheduled_at, created_at) DESC')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 20));

        return TaskResource::collection($tasks);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'assigned_to' => ['nullable', 'array'],
            'assigned_to.*' => ['exists:users,id'],
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:5000'],
            'type' => ['required', Rule::enum(TaskType::class)],
            'priority' => ['required', Rule::enum(TaskPriority::class)],
            'site_address' => ['nullable', 'string', 'max:500'],
            'site_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'site_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'site_map_url' => ['nullable', 'string', 'max:1000'],
            'asset_id' => ['nullable', 'exists:assets,id'],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'scheduled_at' => ['nullable', 'date'],
        ]);

        $this->assertBelongsToCustomer($data);
        $this->assertBranchVisitWindow($data);

        $data['created_by'] = $request->user()->id;
        $data['status'] = TaskStatus::Pending;

        // Inherit a location when the manager did not type one, so the
        // technician always gets a usable destination. The branch wins over the
        // account address: a job sent to Maadi should not navigate to head
        // office just because nobody re-typed the street.
        if (blank($data['site_address'] ?? null) && blank($data['site_lat'] ?? null)) {
            $source = ! empty($data['branch_id'])
                ? Branch::find($data['branch_id'])
                : Customer::find($data['customer_id']);

            $data['site_address'] = $source?->address;
            $data['site_lat'] = $source?->lat;
            $data['site_lng'] = $source?->lng;
            $data['site_map_url'] = $source?->map_url;
        }

        $assignees = $data['assigned_to'] ?? [];
        unset($data['assigned_to']);

        $task = Task::create($data);
        
        if (!empty($assignees)) {
            $task->technicians()->sync($assignees);
        }

        ActivityLog::record('task.created', $task, "تم إنشاء المهمة {$task->code}");

        // Assign through the workflow so the technician gets notified.
        foreach ($assignees as $assignee) {
            if ($technician = User::find($assignee)) {
                $task = $this->workflow->assign($task, $technician, $request->user());
            }
        }

        return response()->json(
            new TaskResource($task->load(['customer', 'branch', 'technicians', 'creator', 'asset'])),
            201,
        );
    }

    public function show(Request $request, Task $task): TaskResource
    {
        $this->authorizeView($request, $task);

        return new TaskResource($task->load([
            'customer',
            'branch',
            'technicians',
            'creator',
            'asset',
            'contract',
            'statusLogs.user',
            'reports.author',
            'reports.attachments',
            'attachments.uploader',
            'expenses.actor',
            'postponements.requester',
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
            'branch_id' => ['nullable', 'exists:branches,id'],
            'scheduled_at' => ['nullable', 'date'],
        ]);

        $this->assertBelongsToCustomer($data);
        $this->assertBranchVisitWindow($data, $task);

        $task->update($data);

        ActivityLog::record('task.updated', $task, "تم تعديل المهمة {$task->code}");

        return new TaskResource($task->fresh(['customer', 'branch', 'technicians', 'creator', 'asset']));
    }

    /**
     * A job may only point at a device or a site the same customer owns.
     * Without this, picking an id by hand would attach one customer's unit to
     * another's job, and that device or branch would quietly gain a visit that
     * never happened.
     *
     * @param  array<string, mixed>  $data
     */
    protected function assertBelongsToCustomer(array $data): void
    {
        $customerId = (int) $data['customer_id'];

        if (! empty($data['asset_id'])) {
            $owner = Asset::whereKey($data['asset_id'])->value('customer_id');

            if ((int) $owner !== $customerId) {
                throw ValidationException::withMessages([
                    'asset_id' => Terms::get('الجهاز المحدد لا يخص هذا العميل.'),
                ]);
            }
        }

        if (! empty($data['branch_id'])) {
            $owner = Branch::whereKey($data['branch_id'])->value('customer_id');

            if ((int) $owner !== $customerId) {
                throw ValidationException::withMessages([
                    'branch_id' => Terms::get('الفرع المحدد لا يخص هذا العميل.'),
                ]);
            }
        }
    }

    /**
     * A branch cannot receive another visit until 22 days after the last
     * completed job there. The candidate date is the scheduled slot when one is
     * set, or "now" for an immediate unscheduled job.
     *
     * @param  array<string, mixed>  $data
     */
    protected function assertBranchVisitWindow(array $data, ?Task $ignoreTask = null): void
    {
        // Urgent visits are an explicit operational override. They can be
        // created immediately even when the branch is inside the normal
        // 22-day recurring-visit window; ordinary visits keep the guard below.
        if (($data['priority'] ?? null) === TaskPriority::Urgent->value) {
            return;
        }

        if (empty($data['branch_id'])) {
            return;
        }

        $branch = Branch::find($data['branch_id']);
        $availableAt = $branch?->nextVisitAvailableAt($ignoreTask?->id);

        if (! $availableAt) {
            return;
        }

        $candidate = $this->candidateVisitDate($data);

        if ($candidate->lt($availableAt)) {
            throw ValidationException::withMessages([
                'branch_id' => Terms::get(sprintf(
                    'لا يمكن فتح مهمة أو زيارة جديدة لهذا الفرع قبل %s. آخر زيارة انتهت في %s.',
                    $availableAt->format('Y-m-d H:i'),
                    $branch->lastVisitCompletedAt($ignoreTask?->id)?->format('Y-m-d H:i'),
                )),
            ]);
        }
    }

    /** @param  array<string, mixed>  $data */
    protected function candidateVisitDate(array $data): CarbonInterface
    {
        return ! empty($data['scheduled_at'])
            ? CarbonImmutable::parse($data['scheduled_at'])
            : CarbonImmutable::now();
    }

    /** Assign or reassign the job to technicians. */
    public function assign(Request $request, Task $task): TaskResource
    {
        $data = $request->validate([
            'assigned_to' => ['nullable', 'array'],
            'assigned_to.*' => ['exists:users,id'],
        ]);

        $assignees = $data['assigned_to'] ?? [];

        foreach ($assignees as $assigneeId) {
            $technician = User::find($assigneeId);
            if ($technician && ! $technician->isTechnician()) {
                throw ValidationException::withMessages([
                    'assigned_to' => Terms::get('يجب اختيار مستخدمين بدور «فني».'),
                ]);
            }

            if ($technician && ! $technician->is_active) {
                throw ValidationException::withMessages([
                    'assigned_to' => Terms::get('أحد الفنيين موقوف ولا يمكن إسناد مهام إليه.'),
                ]);
            }
        }

        $task->technicians()->sync($assignees);

        foreach ($assignees as $assigneeId) {
            if ($technician = User::find($assigneeId)) {
                $task = $this->workflow->assign($task, $technician, $request->user());
            }
        }

        return new TaskResource($task->fresh(['technicians']));
    }

    /**
     * Bulk-create tasks: the manager picks one technician + shared fields, then
     * adds as many (customer, branch) targets as needed. One Task is created per
     * target row, and the technician is notified for every one of them.
     */
    public function bulkCreate(Request $request): JsonResponse
    {
        $shared = $request->validate([
            'assigned_to'   => ['nullable', 'array'],
            'assigned_to.*' => ['exists:users,id'],
            'title'         => ['required', 'string', 'max:200'],
            'description'   => ['nullable', 'string', 'max:5000'],
            'type'          => ['required', Rule::enum(TaskType::class)],
            'priority'      => ['required', Rule::enum(TaskPriority::class)],
            'scheduled_at'  => ['nullable', 'date'],
            'targets'       => ['required', 'array', 'min:1', 'max:50'],
            'targets.*.customer_id' => ['required', 'exists:customers,id'],
            'targets.*.branch_id'   => ['nullable', 'exists:branches,id'],
        ]);

        $assignees = $shared['assigned_to'] ?? [];
        unset($shared['assigned_to'], $shared['targets']);

        $created = [];

        foreach ($request->input('targets') as $target) {
            $data = array_merge($shared, [
                'customer_id' => $target['customer_id'],
                'branch_id'   => $target['branch_id'] ?? null,
                'status'      => TaskStatus::Pending,
                'created_by'  => $request->user()->id,
            ]);

            // Inherit address from branch or customer if not set
            $source = ! empty($data['branch_id'])
                ? Branch::find($data['branch_id'])
                : Customer::find($data['customer_id']);

            $data['site_address'] = $source?->address;
            $data['site_lat']     = $source?->lat;
            $data['site_lng']     = $source?->lng;
            $data['site_map_url'] = $source?->map_url;

            $task = Task::create($data);

            if (! empty($assignees)) {
                $task->technicians()->sync($assignees);
                foreach ($assignees as $assigneeId) {
                    if ($technician = User::find($assigneeId)) {
                        $task = $this->workflow->assign($task, $technician, $request->user());
                    }
                }
            }

            ActivityLog::record('task.created', $task, "تم إنشاء المهمة {$task->code} (جماعي)");
            $created[] = $task->load(['customer', 'branch', 'technicians', 'creator']);
        }

        return response()->json([
            'count'   => count($created),
            'message' => "تم إنشاء " . count($created) . " مهمة بنجاح.",
            'tasks'   => TaskResource::collection(collect($created)),
        ], 201);
    }

    public function destroy(Task $task): JsonResponse
    {
        $code = $task->code;
        $task->delete();

        ActivityLog::record('task.deleted', $task, "تم حذف المهمة {$code}");

        return response()->json(['message' => Terms::get('تم حذف المهمة.')]);
    }

    /** A technician may only open a job assigned to them. */
    protected function authorizeView(Request $request, Task $task): void
    {
        $user = $request->user();

        abort_if(
            $user->isTechnician() && ! $task->technicians()->where('users.id', $user->id)->exists(),
            403,
            'هذه المهمة غير مسندة إليك.',
        );
    }
}
