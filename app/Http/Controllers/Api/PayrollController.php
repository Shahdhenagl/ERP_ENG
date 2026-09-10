<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\CashBox;
use App\Models\Employee;
use App\Models\PayrollAdjustment;
use App\Models\Payslip;
use App\Models\PayrollRun;
use App\Models\SalaryAdvance;
use App\Services\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class PayrollController extends Controller
{
    public function __construct(protected PayrollService $payroll) {}

    /* ── Advances ────────────────────────────────────────── */

    public function advances(Request $request): JsonResponse
    {
        $advances = SalaryAdvance::query()
            ->when($request->integer('employee_id'), fn ($q, $id) => $q->where('employee_id', $id))
            ->with(['employee', 'box', 'creator'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 40));

        return response()->json([
            'data' => $advances->through(fn (SalaryAdvance $a) => [
                'id' => $a->id,
                'code' => $a->code,
                'employee' => $a->employee?->name,
                'employee_id' => $a->employee_id,
                'advance_date' => $a->advance_date?->toDateString(),
                'amount' => (float) $a->amount,
                'installment' => (float) $a->installment,
                'outstanding' => $a->employee ? max(0.0, $a->employee->outstandingAdvances()) : 0.0,
                'is_reversed' => $a->isReversed(),
                'reversed_at' => $a->reversed_at?->toIso8601String(),
                'box' => $a->box?->name,
                'notes' => $a->notes,
                'created_by' => $a->creator?->name,
                'created_at' => $a->created_at?->toIso8601String(),
            ])->items(),
            'meta' => ['total' => $advances->total(), 'last_page' => $advances->lastPage()],
        ]);
    }

    public function storeAdvance(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'installment' => ['nullable', 'numeric', 'min:0'],
            'cash_box_id' => ['required', 'exists:cash_boxes,id'],
            'advance_date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $advance = $this->payroll->advance($data, $request->user());

        ActivityLog::record(
            'advance.created',
            $advance,
            "سلفة {$advance->code} — ".number_format((float) $advance->amount, 2),
        );

        return response()->json(['data' => [
            'id' => $advance->id,
            'code' => $advance->code,
            'amount' => (float) $advance->amount,
        ]], 201);
    }

    /**
     * Only repayment terms may change after cash has left the box. Altering the
     * employee, amount, date or box would make the advance disagree with its
     * immutable treasury movement and accounting entry.
     */
    public function updateAdvance(Request $request, SalaryAdvance $salaryAdvance): JsonResponse
    {
        abort_if($salaryAdvance->isReversed(), 422, 'لا يمكن تعديل سلفة تم التراجع عنها.');
        $data = $request->validate([
            'installment' => ['required', 'numeric', 'gt:0', 'lte:'.$salaryAdvance->amount],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $salaryAdvance->update([
            'installment' => round((float) $data['installment'], 2),
            'notes' => $data['notes'] ?? null,
        ]);

        ActivityLog::record(
            'advance.updated',
            $salaryAdvance,
            "تعديل شروط السلفة {$salaryAdvance->code}",
            ['installment' => (float) $salaryAdvance->installment],
        );

        return response()->json(['data' => [
            'id' => $salaryAdvance->id,
            'code' => $salaryAdvance->code,
            'installment' => (float) $salaryAdvance->installment,
            'notes' => $salaryAdvance->notes,
        ]]);
    }

    public function reverseAdvance(Request $request, SalaryAdvance $salaryAdvance): JsonResponse
    {
        $reversed = $this->payroll->reverseAdvance($salaryAdvance->load('employee', 'cashMovement'), $request->user());

        ActivityLog::record(
            'advance.reversed',
            $reversed,
            "التراجع عن السلفة {$reversed->code}",
        );

        return response()->json(['data' => [
            'id' => $reversed->id,
            'code' => $reversed->code,
            'is_reversed' => true,
            'reversed_at' => $reversed->reversed_at?->toIso8601String(),
        ]]);
    }

    /* ── Deductions & bonuses ────────────────────────────── */

    public function adjustments(Request $request): JsonResponse
    {
        $adjustments = PayrollAdjustment::query()
            ->when($request->integer('employee_id'), fn ($q, $id) => $q->where('employee_id', $id))
            ->when($request->integer('year'), fn ($q, $y) => $q->where('year', $y))
            ->when($request->integer('month'), fn ($q, $m) => $q->where('month', $m))
            ->with('employee:id,name,code')
            ->orderByDesc('year')
            ->orderByDesc('month')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 40));

        return response()->json([
            'data' => $adjustments->through(fn (PayrollAdjustment $a) => [
                'id' => $a->id,
                'employee_id' => $a->employee_id,
                'employee' => $a->employee?->name,
                'employee_code' => $a->employee?->code,
                'type' => $a->type,
                'type_label' => $a->type === 'bonus' ? 'مكافأة' : 'خصم',
                'amount' => (float) $a->amount,
                'reason' => $a->reason,
                'year' => $a->year,
                'month' => $a->month,
            ])->items(),
            'meta' => ['total' => $adjustments->total(), 'last_page' => $adjustments->lastPage()],
        ]);
    }

    public function storeAdjustment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'type' => ['required', 'in:deduction,bonus'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'reason' => ['nullable', 'string', 'max:300'],
            'year' => ['required', 'integer', 'min:2020', 'max:2100'],
            'month' => ['required', 'integer', 'min:1', 'max:12'],
        ]);

        $adjustment = PayrollAdjustment::create([
            ...$data,
            'created_by' => $request->user()->id,
        ]);

        $label = $data['type'] === 'bonus' ? 'مكافأة' : 'خصم';
        ActivityLog::record(
            'payroll.adjustment.created',
            $adjustment,
            "{$label} ".number_format((float) $adjustment->amount, 2)." — {$adjustment->employee?->name}",
        );

        return response()->json(['data' => ['id' => $adjustment->id]], 201);
    }

    public function updateAdjustment(Request $request, PayrollAdjustment $payrollAdjustment): JsonResponse
    {
        $this->assertAdjustmentEditable($payrollAdjustment);
        $data = $this->validatedAdjustment($request);
        $payrollAdjustment->update($data);

        ActivityLog::record(
            'payroll.adjustment.updated',
            $payrollAdjustment,
            "تعديل بند رواتب {$payrollAdjustment->employee?->name}",
        );

        return response()->json(['data' => $this->presentAdjustment($payrollAdjustment->fresh('employee'))]);
    }

    public function deleteAdjustment(PayrollAdjustment $payrollAdjustment): JsonResponse
    {
        $this->assertAdjustmentEditable($payrollAdjustment);
        $code = $payrollAdjustment->id;
        $payrollAdjustment->delete();

        ActivityLog::record('payroll.adjustment.deleted', $payrollAdjustment, "حذف بند رواتب {$code}");

        return response()->json(['deleted' => true]);
    }

    /** @return array<string, mixed> */
    protected function validatedAdjustment(Request $request): array
    {
        return $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'type' => ['required', 'in:deduction,bonus'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'reason' => ['nullable', 'string', 'max:300'],
            'year' => ['required', 'integer', 'min:2020', 'max:2100'],
            'month' => ['required', 'integer', 'min:1', 'max:12'],
        ]);
    }

    protected function assertAdjustmentEditable(PayrollAdjustment $adjustment): void
    {
        if (PayrollRun::where('year', $adjustment->year)
            ->where('month', $adjustment->month)
            ->whereIn('status', ['approved', 'paid'])
            ->exists()) {
            throw ValidationException::withMessages([
                'adjustment' => 'لا يمكن تعديل بند بعد اعتماد أو صرف كشف الرواتب الخاص بالشهر.',
            ]);
        }
    }

    /** @return array<string, mixed> */
    protected function presentAdjustment(PayrollAdjustment $adjustment): array
    {
        return [
            'id' => $adjustment->id,
            'employee_id' => $adjustment->employee_id,
            'employee' => $adjustment->employee?->name,
            'employee_code' => $adjustment->employee?->code,
            'type' => $adjustment->type,
            'type_label' => $adjustment->type === 'bonus' ? 'مكافأة' : 'خصم',
            'amount' => (float) $adjustment->amount,
            'reason' => $adjustment->reason,
            'year' => $adjustment->year,
            'month' => $adjustment->month,
        ];
    }

    /* ── Runs ────────────────────────────────────────────── */

    public function index(Request $request): JsonResponse
    {
        $runs = PayrollRun::query()
            ->withCount('payslips')
            ->withSum('payslips', 'gross')
            ->withSum('payslips', 'total_deductions')
            ->withSum('payslips', 'net')
            ->orderByDesc('year')
            ->orderByDesc('month')
            ->paginate($request->integer('per_page', 24));

        return response()->json([
            'data' => $runs->through(fn (PayrollRun $r) => [
                'id' => $r->id,
                'code' => $r->code,
                'year' => $r->year,
                'month' => $r->month,
                'month_label' => $r->monthLabel(),
                'status' => $r->status,
                'status_label' => $r->statusLabel(),
                'payslips_count' => $r->payslips_count,
                'gross_total' => round((float) $r->payslips_sum_gross, 2),
                'deductions_total' => round((float) $r->payslips_sum_total_deductions, 2),
                'net_total' => round((float) $r->payslips_sum_net, 2),
                'unpaid_net' => $r->unpaidNet(),
                'approved_at' => $r->approved_at?->toDateString(),
            ])->items(),
            'meta' => ['total' => $runs->total(), 'last_page' => $runs->lastPage()],
        ]);
    }

    public function open(Request $request): JsonResponse
    {
        $data = $request->validate([
            'year' => ['required', 'integer', 'min:2020', 'max:2100'],
            'month' => ['required', 'integer', 'min:1', 'max:12'],
        ]);

        $run = $this->payroll->open($data['year'], $data['month'], $request->user());

        ActivityLog::record('payroll.created', $run, "فتح كشف رواتب {$run->monthLabel()}");

        return response()->json(['data' => $this->presentRun($run)], 201);
    }

    public function destroy(PayrollRun $payrollRun): JsonResponse
    {
        $code = $payrollRun->code;
        $this->payroll->deleteDraft($payrollRun);
        ActivityLog::record('payroll.deleted', $payrollRun, "حذف كشف رواتب {$code}");

        return response()->json(['deleted' => true]);
    }

    public function show(PayrollRun $payrollRun): JsonResponse
    {
        return response()->json(['data' => $this->presentRun($payrollRun->load('payslips.employee'))]);
    }

    public function approve(Request $request, PayrollRun $payrollRun): JsonResponse
    {
        $run = $this->payroll->approve($payrollRun, $request->user());

        ActivityLog::record(
            'payroll.approved',
            $run,
            "اعتماد كشف رواتب {$run->monthLabel()}",
        );

        return response()->json(['data' => $this->presentRun($run->load('payslips.employee'))]);
    }

    public function reopen(Request $request, PayrollRun $payrollRun): JsonResponse
    {
        $run = $this->payroll->reopen($payrollRun, $request->user());
        ActivityLog::record('payroll.reopened', $run, "إعادة فتح كشف رواتب {$run->monthLabel()} للتصحيح");

        return response()->json(['data' => $this->presentRun($run->load('payslips.employee'))]);
    }

    public function pay(Request $request, PayrollRun $payrollRun): JsonResponse
    {
        $data = $request->validate(['cash_box_id' => ['nullable', 'exists:cash_boxes,id']]);

        $box = ! empty($data['cash_box_id']) ? CashBox::findOrFail($data['cash_box_id']) : null;
        $count = $this->payroll->payRun($payrollRun, $request->user(), $box);

        ActivityLog::record(
            'payroll.paid',
            $payrollRun,
            "صرف {$count} راتبًا من كشف رواتب {$payrollRun->monthLabel()}",
        );

        return response()->json([
            'data' => $this->presentRun($payrollRun->fresh('payslips.employee')),
            'paid' => $count,
        ]);
    }

    /* ── Payslips ────────────────────────────────────────── */

    public function adjustSlip(Request $request, Payslip $payslip): JsonResponse
    {
        $data = $request->validate([
            'worked_days' => ['nullable', 'integer', 'min:0', 'max:31', 'lte:'.$payslip->salary_basis_days],
            'advance_recovery' => ['nullable', 'numeric', 'min:0'],
            'other_deductions' => ['nullable', 'numeric', 'min:0'],
            'other_note' => ['nullable', 'string', 'max:255'],
        ]);

        $slip = $this->payroll->adjustSlip($payslip, $data);

        ActivityLog::record(
            'payroll.updated',
            $slip,
            "تجهيز راتب {$slip->employee?->name}",
            [
                'worked_days' => (float) $slip->worked_days,
                'salary_basis_days' => (int) $slip->salary_basis_days,
                'net' => (float) $slip->net,
            ],
        );

        return response()->json(['data' => $this->presentSlip($slip->load('employee'))]);
    }

    public function paySlip(Request $request, Payslip $payslip): JsonResponse
    {
        $data = $request->validate(['cash_box_id' => ['nullable', 'exists:cash_boxes,id']]);

        $box = ! empty($data['cash_box_id']) ? CashBox::findOrFail($data['cash_box_id']) : null;
        $slip = $this->payroll->paySlip($payslip, $request->user(), $box);

        return response()->json(['data' => $this->presentSlip($slip->load(['employee', 'run']))]);
    }

    /** One slip, for the printable payslip. */
    public function slip(Payslip $payslip): JsonResponse
    {
        return response()->json([
            'data' => $this->presentSlip($payslip->load(['employee', 'run', 'box'])),
        ]);
    }

    /* ── Presenters ──────────────────────────────────────── */

    /** @return array<string, mixed> */
    protected function presentRun(PayrollRun $run): array
    {
        return [
            'id' => $run->id,
            'code' => $run->code,
            'year' => $run->year,
            'month' => $run->month,
            'month_label' => $run->monthLabel(),
            'status' => $run->status,
            'status_label' => $run->statusLabel(),
            'days_in_month' => $run->days_in_month,
            'approved_at' => $run->approved_at?->toDateString(),

            'gross_total' => round($run->payslips->sum('gross'), 2),
            'deductions_total' => round($run->payslips->sum('total_deductions'), 2),
            'net_total' => round($run->payslips->sum('net'), 2),
            'unpaid_net' => $run->unpaidNet(),

            'payslips' => $run->payslips->map(fn (Payslip $p) => $this->presentSlip($p))->values(),
        ];
    }

    /** @return array<string, mixed> */
    protected function presentSlip(Payslip $slip): array
    {
        return [
            'id' => $slip->id,
            'payroll_run_id' => $slip->payroll_run_id,
            'run_code' => $slip->run?->code,
            'month' => $slip->run?->monthLabel(),

            'employee_id' => $slip->employee_id,
            'employee' => $slip->employee?->name,
            'employee_code' => $slip->employee?->code,
            'job_title' => $slip->employee?->job_title,

            'basic_salary' => (float) $slip->basic_salary,
            'salary_basis_days' => (int) ($slip->salary_basis_days ?: 30),
            'worked_days' => (float) $slip->worked_days,
            'daily_salary' => round((float) $slip->gross / max(1, (int) ($slip->salary_basis_days ?: 30)), 2),
            'insurance_rate' => (float) $slip->insurance_rate,
            'tax_rate' => (float) $slip->tax_rate,
            'allowances' => $slip->allowances ?? [],
            'allowances_total' => (float) $slip->allowances_total,
            'additions_total' => (float) $slip->additions_total,
            'gross' => (float) $slip->gross,

            'unpaid_days' => $slip->unpaid_days,
            'unpaid_deduction' => (float) $slip->unpaid_deduction,
            'advance_recovery' => (float) $slip->advance_recovery,
            'insurance' => (float) $slip->insurance,
            'tax' => (float) $slip->tax,
            'other_deductions' => (float) $slip->other_deductions,
            'other_note' => $slip->other_note,
            'total_deductions' => (float) $slip->total_deductions,

            'net' => (float) $slip->net,

            'paid_on' => $slip->paid_on?->toDateString(),
            'box' => $slip->box?->name,
            'is_paid' => $slip->isPaid(),
        ];
    }
}
