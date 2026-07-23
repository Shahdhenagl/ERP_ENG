<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\CashBox;
use App\Models\Employee;
use App\Models\Payslip;
use App\Models\PayrollRun;
use App\Models\SalaryAdvance;
use App\Services\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayrollController extends Controller
{
    public function __construct(protected PayrollService $payroll) {}

    /* ── Advances ────────────────────────────────────────── */

    public function advances(Request $request): JsonResponse
    {
        $advances = SalaryAdvance::query()
            ->when($request->integer('employee_id'), fn ($q, $id) => $q->where('employee_id', $id))
            ->with(['employee', 'box'])
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
                'box' => $a->box?->name,
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
            'cash_box_id' => ['nullable', 'exists:cash_boxes,id'],
            'advance_date' => ['nullable', 'date'],
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

    /* ── Runs ────────────────────────────────────────────── */

    public function index(Request $request): JsonResponse
    {
        $runs = PayrollRun::query()
            ->withCount('payslips')
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

        ActivityLog::record('payroll.created', $run, "فتح مسير رواتب {$run->monthLabel()}");

        return response()->json(['data' => $this->presentRun($run)], 201);
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
            "اعتماد مسير رواتب {$run->monthLabel()}",
        );

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
            "صرف {$count} راتبًا من مسير {$payrollRun->monthLabel()}",
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
            'advance_recovery' => ['nullable', 'numeric', 'min:0'],
            'other_deductions' => ['nullable', 'numeric', 'min:0'],
            'other_note' => ['nullable', 'string', 'max:255'],
        ]);

        $slip = $this->payroll->adjustSlip($payslip, $data);

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
            'allowances' => $slip->allowances ?? [],
            'allowances_total' => (float) $slip->allowances_total,
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
