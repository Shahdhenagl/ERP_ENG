<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\TechnicianMonthlyReport;
use App\Models\User;
use App\Support\Terms;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The monthly report handover register.
 *
 * Each received report is a separate record. A technician can therefore hand
 * over several reports in the same month, and every report keeps its own
 * customer, branch, notes and scanned attachments.
 */
class TechnicianMonthlyReportController extends Controller
{
    /** Every report for a month, newest handovers first. */
    public function index(Request $request): JsonResponse
    {
        $period = TechnicianMonthlyReport::periodFor($request->string('period')->toString());

        $reports = TechnicianMonthlyReport::query()
            ->forPeriod($period)
            ->with($this->reportRelations())
            ->withCount('attachments')
            ->orderByDesc('received_on')
            ->orderByDesc('id')
            ->get();

        $rows = $reports->map(function (TechnicianMonthlyReport $report) {
            return [
                'technician_id' => $report->technician_id,
                'technician' => $report->technician?->name ?? '—',
                'report' => $this->present($report),
            ];
        })->values();

        $technicians = User::query()
            ->active()
            ->role(UserRole::Technician)
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json([
            'data' => $rows,
            'meta' => [
                'period' => $period,
                'total' => $technicians->count(),
                'received' => $reports->pluck('technician_id')->unique()->count(),
                'reports_total' => $reports->count(),
                'technicians' => $technicians->map(fn (User $technician) => [
                    'id' => $technician->id,
                    'name' => $technician->name,
                ])->values(),
            ],
        ]);
    }

    /** Record a new handover, or correct an existing report. */
    public function store(Request $request): JsonResponse
    {
        $this->ensureLocationColumnsAreReady();

        $data = $request->validate([
            'report_id' => ['nullable', 'integer', 'exists:technician_monthly_reports,id'],
            'technician_id' => [
                'required',
                Rule::exists('users', 'id')->where(fn (Builder $query) => $query->where('role', UserRole::Technician->value)),
            ],
            'period' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'customer_id' => ['required', 'exists:customers,id'],
            'branch_id' => [
                'nullable',
                Rule::exists('branches', 'id')->where(
                    fn (Builder $query) => $query->where('customer_id', $request->input('customer_id')),
                ),
            ],
            'received_by_user_id' => ['nullable', 'exists:users,id'],
            'received_on' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $report = isset($data['report_id'])
            ? TechnicianMonthlyReport::query()
                ->forPeriod($data['period'])
                ->findOrFail($data['report_id'])
            : new TechnicianMonthlyReport();

        $report->fill([
            'technician_id' => $data['technician_id'],
            'period' => $data['period'],
            'customer_id' => $data['customer_id'],
            'branch_id' => $data['branch_id'] ?? null,
            'received_by_user_id' => $data['received_by_user_id'] ?? $request->user()->id,
            'received_on' => $data['received_on'] ?? now()->toDateString(),
            'notes' => $data['notes'] ?? null,
        ]);

        if (! $report->exists) {
            $report->created_by = $request->user()->id;
        }

        $report->save();

        ActivityLog::record(
            'technician.report',
            $report,
            "استلام التقرير الشهري {$report->period} من {$report->technician?->name}",
        );

        return response()->json(
            ['data' => $this->present($report->load($this->reportRelations())->loadCount('attachments'))],
            $report->wasRecentlyCreated ? 201 : 200,
        );
    }

    /** Delete one handover record and its attached files. */
    public function destroy(TechnicianMonthlyReport $technicianMonthlyReport): JsonResponse
    {
        $technicianMonthlyReport->delete();

        return response()->json(['message' => Terms::get('تم حذف تسجيل الاستلام.')]);
    }

    /**
     * Keep the listing usable while production is waiting for the feature
     * migration. Eager-loading the location relations is intentionally skipped
     * in that state so this endpoint never depends on the missing columns.
     *
     * @return array<int, string>
     */
    protected function reportRelations(): array
    {
        return Schema::hasColumns('technician_monthly_reports', ['customer_id', 'branch_id'])
            ? ['technician', 'customer', 'branch', 'receiver', 'recorder']
            : ['technician', 'receiver', 'recorder'];
    }

    protected function ensureLocationColumnsAreReady(): void
    {
        if (Schema::hasColumns('technician_monthly_reports', ['customer_id', 'branch_id'])) {
            return;
        }

        throw ValidationException::withMessages([
            'customer_id' => 'لا يمكن حفظ التقرير حاليًا لأن قاعدة البيانات تحتاج إلى تحديث لتفعيل ربط العميل والفرع. يرجى إبلاغ مدير النظام.',
        ]);
    }

    /** @return array<string, mixed> */
    protected function present(TechnicianMonthlyReport $report): array
    {
        return [
            'id' => $report->id,
            'technician_id' => $report->technician_id,
            'period' => $report->period,
            'customer_id' => $report->customer_id,
            'customer' => $report->customer?->name,
            'branch_id' => $report->branch_id,
            'branch' => $report->branch?->name,
            'received_by' => $report->receiver?->name,
            'received_by_user_id' => $report->received_by_user_id,
            'received_on' => $report->received_on?->toDateString(),
            'notes' => $report->notes,
            'recorded_by' => $report->recorder?->name,
            'attachments_count' => $report->attachments_count ?? 0,
        ];
    }
}
