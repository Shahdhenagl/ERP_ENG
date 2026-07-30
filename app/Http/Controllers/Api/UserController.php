<?php

namespace App\Http\Controllers\Api;

use App\Enums\AttendanceStatus;
use App\Enums\TaskStatus;
use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\ActivityLog;
use App\Models\JobRole;
use App\Models\Attendance;
use App\Models\Payslip;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $users = User::query()
            ->when($request->string('role')->toString(), fn ($q, $role) => $q->where('role', $role))
            ->when($request->string('search')->toString(), function ($q, $term) {
                $q->where(function ($sub) use ($term) {
                    $sub->where('name', 'like', "%{$term}%")
                        ->orWhere('email', 'like', "%{$term}%")
                        ->orWhere('phone', 'like', "%{$term}%");
                });
            })
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->withCount(['assignedTasks' => fn ($q) => $q->open()])
            ->orderBy('name')
            ->paginate($request->integer('per_page', 25));

        return UserResource::collection($users);
    }

    /** Lightweight list for the "assign to" picker. */
    public function technicians(): AnonymousResourceCollection
    {
        $technicians = User::query()
            ->active()
            ->role(UserRole::Technician)
            ->withCount(['assignedTasks' => fn ($q) => $q->open()])
            ->orderBy('name')
            ->get();

        return UserResource::collection($technicians);
    }

    /**
     * A manager's full read on one technician for a month: the work they did, the
     * attendance they logged, their leave, and their pay — one screen the owner
     * uses to review and to settle.
     */
    public function technicianProfile(Request $request, User $user): JsonResponse
    {
        $request->validate([
            'year' => ['nullable', 'integer', 'min:2020', 'max:2100'],
            'month' => ['nullable', 'integer', 'min:1', 'max:12'],
        ]);

        $year = $request->integer('year') ?: (int) now()->year;
        $month = $request->integer('month') ?: (int) now()->month;

        $employee = $user->employee;
        $effective = 'COALESCE(scheduled_at, created_at)';

        // The jobs they carried out in the month.
        $tasks = $user->assignedTasks()
            ->whereRaw("YEAR({$effective}) = ? AND MONTH({$effective}) = ?", [$year, $month])
            ->with(['customer:id,name', 'branch:id,name'])
            ->orderByRaw("{$effective} desc")
            ->get();

        // Their attendance for the month, and the roll-up the manager reads.
        $attendance = $employee
            ? Attendance::where('employee_id', $employee->id)->forMonth($year, $month)
                ->orderByDesc('date')->get()
            : collect();

        $payslip = $employee
            ? Payslip::where('employee_id', $employee->id)
                ->whereHas('run', fn ($q) => $q->where('year', $year)->where('month', $month))
                ->with('run')
                ->first()
            : null;

        return response()->json([
            'data' => [
                'technician' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'phone' => $user->phone,
                    'job_title' => $user->job_title,
                    'open_tasks' => $user->assignedTasks()->open()->count(),
                ],
                'month' => ['year' => $year, 'month' => $month],

                // The HR file, or a flag that none is linked yet.
                'employee' => $employee ? [
                    'id' => $employee->id,
                    'code' => $employee->code,
                    'status' => $employee->status,
                    'status_label' => $employee->statusLabel(),
                    'basic_salary' => (float) $employee->basic_salary,
                    'allowances_total' => $employee->allowancesTotal(),
                    'gross_salary' => $employee->grossSalary(),
                    'annual_leave_days' => (int) $employee->annual_leave_days,
                    'annual_leave_taken' => $employee->annualLeaveTaken($year),
                    'annual_leave_remaining' => $employee->annualLeaveRemaining($year),
                    'outstanding_advances' => $employee->outstandingAdvances(),
                ] : null,

                'tasks' => [
                    'total' => $tasks->count(),
                    'completed' => $tasks->where('status', TaskStatus::Completed)->count(),
                    'rows' => $tasks->map(fn ($task) => [
                        'id' => $task->id,
                        'code' => $task->code,
                        'date' => ($task->scheduled_at ?? $task->created_at)?->toIso8601String(),
                        'title' => $task->title,
                        'type_label' => $task->type->label(),
                        'status' => $task->status->value,
                        'status_label' => $task->status->label(),
                        'customer' => $task->customer?->name,
                        'branch' => $task->branch?->name,
                    ])->values(),
                ],

                'attendance' => [
                    'present_days' => $attendance->where('status', AttendanceStatus::Present)->count(),
                    'late_days' => $attendance->where('status', AttendanceStatus::Late)->count(),
                    'absent_days' => $attendance->where('status', AttendanceStatus::Absent)->count(),
                    'leave_days' => $attendance->where('status', AttendanceStatus::Leave)->count(),
                    'attended_days' => $attendance->filter(fn (Attendance $a) => $a->status->isAttended())->count(),
                    'worked_hours' => round((float) $attendance->sum('worked_hours'), 2),
                    'rows' => $attendance->map(fn (Attendance $a) => [
                        'id' => $a->id,
                        'date' => $a->date?->toDateString(),
                        'status' => $a->status->value,
                        'status_label' => $a->statusLabel(),
                        'check_in' => $a->check_in ? substr((string) $a->check_in, 0, 5) : null,
                        'check_out' => $a->check_out ? substr((string) $a->check_out, 0, 5) : null,
                        'worked_hours' => (float) $a->worked_hours,
                        'check_in_location' => $a->check_in_lat !== null
                            ? ['lat' => (float) $a->check_in_lat, 'lng' => (float) $a->check_in_lng]
                            : null,
                    ])->values(),
                ],

                'leave' => $employee
                    ? $employee->leaveRequests()->whereYear('from_date', $year)
                        ->orderByDesc('id')->get()->map(fn ($l) => [
                            'id' => $l->id,
                            'code' => $l->code,
                            'type_label' => $l->typeLabel(),
                            'from_date' => $l->from_date?->toDateString(),
                            'to_date' => $l->to_date?->toDateString(),
                            'days' => $l->days,
                            'status' => $l->status,
                            'status_label' => $l->statusLabel(),
                        ])->values()
                    : [],

                'payslip' => $payslip ? [
                    'id' => $payslip->id,
                    'month_label' => $payslip->run?->monthLabel(),
                    'gross' => (float) $payslip->gross,
                    'total_deductions' => (float) $payslip->total_deductions,
                    'net' => (float) $payslip->net,
                    'paid_on' => $payslip->paid_on?->toDateString(),
                ] : null,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'position' => ['nullable', Rule::in(JobRole::keys())],
            'role' => ['required_without:position', Rule::enum(UserRole::class)],
            'phone' => ['nullable', 'string', 'max:32'],
            'whatsapp' => ['nullable', 'string', 'max:32'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'is_active' => ['boolean'],
        ]);

        $data = $this->applyPosition($data);

        $user = User::create($data);

        ActivityLog::record('user.created', $user, "تم إنشاء المستخدم {$user->name}");

        return response()->json(new UserResource($user), 201);
    }

    public function show(User $user): UserResource
    {
        return new UserResource(
            $user->loadCount(['assignedTasks' => fn ($q) => $q->open()])
        );
    }

    public function update(Request $request, User $user): UserResource
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:8'],
            'position' => ['nullable', Rule::in(JobRole::keys())],
            'role' => ['required_without:position', Rule::enum(UserRole::class)],
            'phone' => ['nullable', 'string', 'max:32'],
            'whatsapp' => ['nullable', 'string', 'max:32'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'is_active' => ['boolean'],
        ]);

        if (blank($data['password'] ?? null)) {
            unset($data['password']);
        }

        $data = $this->applyPosition($data);

        $user->update($data);

        ActivityLog::record('user.updated', $user, "تم تعديل المستخدم {$user->name}");

        return new UserResource($user->fresh());
    }

    /**
     * A position dictates the application (role), so when one is chosen the role
     * follows it — a user's position and the app they get can never disagree.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function applyPosition(array $data): array
    {
        if (! empty($data['position'])) {
            $data['role'] = JobRole::roleFor($data['position'])->value;
        }

        return $data;
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'لا يمكنك حذف حسابك الخاص.'], 422);
        }

        if ($user->assignedTasks()->open()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف فني لديه مهام مفتوحة. أعد إسناد مهامه أولاً.',
            ], 422);
        }

        $name = $user->name;
        $user->delete();

        ActivityLog::record('user.deleted', $user, "تم حذف المستخدم {$name}");

        return response()->json(['message' => 'تم حذف المستخدم.']);
    }
}
