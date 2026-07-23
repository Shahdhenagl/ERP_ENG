<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmployeeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $employees = Employee::query()
            ->search($request->string('search')->toString() ?: null)
            ->when($request->string('department')->toString(), fn ($q, $d) => $q->where('department', $d))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('active'), fn ($q) => $q->active())
            ->orderBy('name')
            ->paginate($request->integer('per_page', 40));

        return response()->json([
            'data' => $employees->through(fn (Employee $e) => $this->present($e))->items(),
            'meta' => [
                'total' => $employees->total(),
                'last_page' => $employees->lastPage(),
                'active' => Employee::query()->active()->count(),
                'monthly_payroll' => round(
                    Employee::query()->active()->get()->sum(fn (Employee $e) => $e->grossSalary()),
                    2,
                ),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $employee = Employee::create([...$data, 'created_by' => $request->user()->id]);

        ActivityLog::record('employee.created', $employee, "إضافة الموظف {$employee->name}");

        return response()->json(['data' => $this->present($employee)], 201);
    }

    public function show(Employee $employee): JsonResponse
    {
        return response()->json([
            'data' => $this->present($employee, detailed: true),
        ]);
    }

    public function update(Request $request, Employee $employee): JsonResponse
    {
        $employee->update($this->validated($request, $employee));

        ActivityLog::record('employee.updated', $employee, "تعديل الموظف {$employee->name}");

        return response()->json(['data' => $this->present($employee->fresh())]);
    }

    public function destroy(Employee $employee): JsonResponse
    {
        // Kept, not deleted, once there is any pay history — the payslips point
        // at it and a statutory record has to survive the person leaving.
        if ($employee->payslips()->exists()) {
            $employee->update(['status' => 'terminated', 'left_on' => now()->toDateString()]);

            return response()->json(['message' => 'تم إنهاء خدمة الموظف مع حفظ سجلّه.']);
        }

        $employee->delete();

        return response()->json(['message' => 'تم حذف الموظف.']);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?Employee $employee = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'user_id' => [
                'nullable', 'exists:users,id',
                Rule::unique('employees')->ignore($employee?->id)->whereNull('deleted_at'),
            ],
            'national_id' => ['nullable', 'string', 'max:32'],
            'phone' => ['nullable', 'string', 'max:32'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'department' => ['nullable', 'string', 'max:120'],
            'hired_on' => ['nullable', 'date'],
            'left_on' => ['nullable', 'date'],
            'employment_type' => ['nullable', 'in:full_time,part_time,contract'],
            'basic_salary' => ['required', 'numeric', 'min:0'],
            'allowances' => ['nullable', 'array'],
            'allowances.*.name' => ['required_with:allowances', 'string', 'max:80'],
            'allowances.*.amount' => ['required_with:allowances', 'numeric', 'min:0'],
            'insurance_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'annual_leave_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'bank_name' => ['nullable', 'string', 'max:120'],
            'bank_account' => ['nullable', 'string', 'max:64'],
            'status' => ['nullable', 'in:active,suspended,terminated'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
    }

    /** @return array<string, mixed> */
    protected function present(Employee $employee, bool $detailed = false): array
    {
        $base = [
            'id' => $employee->id,
            'code' => $employee->code,
            'name' => $employee->name,
            'user_id' => $employee->user_id,
            'national_id' => $employee->national_id,
            'phone' => $employee->phone,
            'job_title' => $employee->job_title,
            'department' => $employee->department,

            'hired_on' => $employee->hired_on?->toDateString(),
            'left_on' => $employee->left_on?->toDateString(),
            'employment_type' => $employee->employment_type,

            'basic_salary' => (float) $employee->basic_salary,
            'allowances' => $employee->allowances ?? [],
            'allowances_total' => $employee->allowancesTotal(),
            'gross_salary' => $employee->grossSalary(),
            'insurance_rate' => (float) $employee->insurance_rate,
            'tax_rate' => (float) $employee->tax_rate,

            'annual_leave_days' => $employee->annual_leave_days,
            'annual_leave_remaining' => $employee->annualLeaveRemaining(),
            'outstanding_advances' => $employee->outstandingAdvances(),

            'bank_name' => $employee->bank_name,
            'bank_account' => $employee->bank_account,

            'status' => $employee->status,
            'status_label' => $employee->statusLabel(),
            'notes' => $employee->notes,
        ];

        if (! $detailed) {
            return $base;
        }

        return [
            ...$base,
            'leave' => $employee->leaveRequests()->latest()->limit(10)->get()->map(fn ($l) => [
                'id' => $l->id,
                'code' => $l->code,
                'type_label' => $l->typeLabel(),
                'from_date' => $l->from_date?->toDateString(),
                'to_date' => $l->to_date?->toDateString(),
                'days' => $l->days,
                'status' => $l->status,
                'status_label' => $l->statusLabel(),
            ]),
            'advances' => $employee->advances()->latest()->limit(10)->get()->map(fn ($a) => [
                'id' => $a->id,
                'code' => $a->code,
                'advance_date' => $a->advance_date?->toDateString(),
                'amount' => (float) $a->amount,
            ]),
            'payslips' => $employee->payslips()->with('run')->latest()->limit(12)->get()->map(fn ($p) => [
                'id' => $p->id,
                'run_code' => $p->run?->code,
                'month' => $p->run?->monthLabel(),
                'net' => (float) $p->net,
                'paid_on' => $p->paid_on?->toDateString(),
            ]),
        ];
    }
}
