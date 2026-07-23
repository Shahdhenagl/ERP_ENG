<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\LeaveRequest;
use App\Services\LeaveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeaveController extends Controller
{
    public function __construct(protected LeaveService $leave) {}

    public function index(Request $request): JsonResponse
    {
        $requests = LeaveRequest::query()
            ->when($request->integer('employee_id'), fn ($q, $id) => $q->where('employee_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('pending'), fn ($q) => $q->pending())
            ->with(['employee', 'decider'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 40));

        return response()->json([
            'data' => $requests->through(fn (LeaveRequest $l) => $this->present($l))->items(),
            'meta' => [
                'total' => $requests->total(),
                'last_page' => $requests->lastPage(),
                'pending' => LeaveRequest::query()->pending()->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'type' => ['required', 'in:annual,sick,unpaid'],
            'from_date' => ['required', 'date'],
            'to_date' => ['required', 'date'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $leave = $this->leave->request($data, $request->user());

        ActivityLog::record('leave.created', $leave, "طلب إجازة {$leave->code}");

        return response()->json(['data' => $this->present($leave->load('employee'))], 201);
    }

    public function decide(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:approve,reject'],
            'note' => ['nullable', 'string', 'max:500'],
            'reason' => ['required_if:action,reject', 'nullable', 'string', 'max:500'],
        ]);

        $decided = $data['action'] === 'approve'
            ? $this->leave->approve($leaveRequest, $request->user(), $data['note'] ?? null)
            : $this->leave->reject($leaveRequest, $request->user(), $data['reason']);

        ActivityLog::record(
            "leave.{$data['action']}d",
            $decided,
            "إجازة {$decided->code}: {$decided->statusLabel()}",
        );

        return response()->json(['data' => $this->present($decided->load(['employee', 'decider']))]);
    }

    public function cancel(LeaveRequest $leaveRequest): JsonResponse
    {
        $cancelled = $this->leave->cancel($leaveRequest);

        return response()->json(['data' => $this->present($cancelled->load('employee'))]);
    }

    /** @return array<string, mixed> */
    protected function present(LeaveRequest $leave): array
    {
        return [
            'id' => $leave->id,
            'code' => $leave->code,

            'employee_id' => $leave->employee_id,
            'employee' => $leave->employee?->name,
            'employee_code' => $leave->employee?->code,

            'type' => $leave->type,
            'type_label' => $leave->typeLabel(),
            'from_date' => $leave->from_date?->toDateString(),
            'to_date' => $leave->to_date?->toDateString(),
            'days' => $leave->days,

            'status' => $leave->status,
            'status_label' => $leave->statusLabel(),
            'reason' => $leave->reason,

            'decided_by' => $leave->decider?->name,
            'decided_at' => $leave->decided_at?->toIso8601String(),
            'decision_note' => $leave->decision_note,

            // The balance as it stands, so an approver weighing an annual
            // request sees what is left before saying yes. Only approved leave
            // has been counted, so a pending request is not yet in it.
            'annual_remaining' => $leave->employee?->annualLeaveRemaining($leave->from_date?->year),

            'created_at' => $leave->created_at?->toIso8601String(),
        ];
    }
}
