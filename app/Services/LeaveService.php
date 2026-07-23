<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\User;
use Carbon\CarbonPeriod;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that moves a leave request between its states.
 *
 * Two rules live here. The days are counted once, on request, and frozen — a
 * weekend rule or a holiday added later must not silently change what was
 * approved. And annual leave cannot be approved past the balance, because a
 * balance that can go negative is not a balance.
 */
class LeaveService
{
    /**
     * File a request. Days are working days between the two dates, weekends
     * excluded, computed here and stored so nothing recomputes them later.
     *
     * @param  array<string, mixed>  $data
     */
    public function request(array $data, ?User $actor = null): LeaveRequest
    {
        $employee = Employee::findOrFail($data['employee_id']);

        $from = now()->parse($data['from_date'])->startOfDay();
        $to = now()->parse($data['to_date'])->startOfDay();

        if ($to->lt($from)) {
            throw ValidationException::withMessages([
                'to_date' => 'تاريخ نهاية الإجازة لا يمكن أن يسبق بدايتها.',
            ]);
        }

        $days = $this->workingDays($from->toDateString(), $to->toDateString());

        if ($days < 1) {
            throw ValidationException::withMessages([
                'from_date' => 'الفترة لا تحتوي على أيام عمل.',
            ]);
        }

        return LeaveRequest::create([
            'employee_id' => $employee->id,
            'type' => $data['type'] ?? 'annual',
            'from_date' => $from->toDateString(),
            'to_date' => $to->toDateString(),
            'days' => $days,
            'reason' => $data['reason'] ?? null,
        ]);
    }

    /**
     * Approve it. Annual leave is checked against the balance at the moment it
     * counts — two pending requests that each fit alone must not both go
     * through and overspend the year.
     */
    public function approve(LeaveRequest $leave, User $decider, ?string $note = null): LeaveRequest
    {
        $this->refuseIfDecided($leave);

        if ($leave->type === 'annual') {
            $remaining = $leave->employee->annualLeaveRemaining(
                $leave->from_date->year,
            );

            if ($leave->days > $remaining) {
                throw ValidationException::withMessages([
                    'days' => "رصيد الإجازات المتبقي {$remaining} يوم فقط.",
                ]);
            }
        }

        $leave->forceFill([
            'status' => 'approved',
            'decided_by' => $decider->id,
            'decided_at' => now(),
            'decision_note' => $note,
        ])->save();

        return $leave->fresh(['employee', 'decider']);
    }

    public function reject(LeaveRequest $leave, User $decider, string $reason): LeaveRequest
    {
        $this->refuseIfDecided($leave);

        $leave->forceFill([
            'status' => 'rejected',
            'decided_by' => $decider->id,
            'decided_at' => now(),
            'decision_note' => $reason,
        ])->save();

        return $leave->fresh(['employee', 'decider']);
    }

    public function cancel(LeaveRequest $leave): LeaveRequest
    {
        if ($leave->status === 'rejected') {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إلغاء طلب مرفوض.',
            ]);
        }

        $leave->forceFill(['status' => 'cancelled'])->save();

        return $leave->fresh();
    }

    /**
     * Unpaid leave days in a given month — what the payroll deducts.
     *
     * Only unpaid counts: annual and sick are paid, so they take nothing off
     * the month's pay.
     */
    public function unpaidDaysIn(Employee $employee, int $year, int $month): int
    {
        return (int) $employee->leaveRequests()
            ->where('type', 'unpaid')
            ->where('status', 'approved')
            ->whereYear('from_date', $year)
            ->whereMonth('from_date', $month)
            ->sum('days');
    }

    /* ── Internals ───────────────────────────────────────── */

    /** Calendar days between two dates, Fridays excluded as the weekend. */
    protected function workingDays(string $from, string $to): int
    {
        return collect(CarbonPeriod::create($from, $to))
            ->reject(fn ($day) => $day->isFriday())
            ->count();
    }

    protected function refuseIfDecided(LeaveRequest $leave): void
    {
        if ($leave->status !== 'pending') {
            throw ValidationException::withMessages([
                'status' => 'تم البتّ في هذا الطلب بالفعل.',
            ]);
        }
    }
}
