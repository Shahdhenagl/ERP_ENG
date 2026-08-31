<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmployeeContractController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $contracts = EmployeeContract::query()
            ->with('employee:id,name,code')
            ->when($request->integer('employee_id'), fn ($q, $id) => $q->where('employee_id', $id))
            ->when($request->string('search')->toString(), function ($q, $search): void {
                $q->where(function ($inner) use ($search): void {
                    $inner->where('code', 'like', "%{$search}%")
                        ->orWhere('title', 'like', "%{$search}%")
                        ->orWhereHas('employee', fn ($employee) => $employee
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('code', 'like', "%{$search}%"));
                });
            })
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('starts_on')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 40));

        return response()->json([
            'data' => $contracts->through(fn (EmployeeContract $contract) => $this->present($contract))->items(),
            'meta' => ['total' => $contracts->total(), 'last_page' => $contracts->lastPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $employee = Employee::findOrFail($data['employee_id']);
        $contract = EmployeeContract::create([...$data, 'created_by' => $request->user()->id]);

        ActivityLog::record('employee_contract.created', $contract, "إضافة عقد للموظف {$employee->name}");

        return response()->json(['data' => $this->present($contract->load('employee'))], 201);
    }

    public function show(EmployeeContract $employeeContract): JsonResponse
    {
        return response()->json(['data' => $this->present($employeeContract->load(['employee', 'attachments.uploader']))]);
    }

    public function update(Request $request, EmployeeContract $employeeContract): JsonResponse
    {
        $data = $this->validated($request, $employeeContract);
        $employeeContract->update($data);
        ActivityLog::record('employee_contract.updated', $employeeContract, "تعديل عقد الموظف {$employeeContract->employee?->name}");

        return response()->json(['data' => $this->present($employeeContract->fresh()->load('employee'))]);
    }

    public function destroy(EmployeeContract $employeeContract): JsonResponse
    {
        $employeeContract->delete();
        ActivityLog::record('employee_contract.deleted', $employeeContract, "حذف عقد الموظف {$employeeContract->employee?->name}");

        return response()->json(['message' => Terms::get('تم حذف عقد الموظف.')]);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?EmployeeContract $contract = null): array
    {
        return $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'title' => ['required', 'string', 'max:160'],
            'contract_type' => ['required', Rule::in(['full_time', 'part_time', 'fixed_term', 'indefinite', 'consultant'])],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'salary' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:4000'],
            'status' => ['required', Rule::in(['draft', 'active', 'expired', 'terminated'])],
        ]);
    }

    /** @return array<string, mixed> */
    protected function present(EmployeeContract $contract): array
    {
        return [
            'id' => $contract->id,
            'code' => $contract->code,
            'employee_id' => $contract->employee_id,
            'employee' => $contract->employee ? [
                'id' => $contract->employee->id,
                'name' => $contract->employee->name,
                'code' => $contract->employee->code,
            ] : null,
            'title' => $contract->title,
            'contract_type' => $contract->contract_type,
            'contract_type_label' => $contract->typeLabel(),
            'starts_on' => $contract->starts_on?->toDateString(),
            'ends_on' => $contract->ends_on?->toDateString(),
            'salary' => (float) $contract->salary,
            'notes' => $contract->notes,
            'status' => $contract->status,
            'status_label' => $contract->statusLabel(),
            'attachments_count' => $contract->relationLoaded('attachments') ? $contract->attachments->count() : null,
            'created_at' => $contract->created_at?->toIso8601String(),
        ];
    }
}
