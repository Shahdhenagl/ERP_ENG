<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\TechnicianMonthlyReport;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The start-of-month check: who has handed their report in, and who took it.
 *
 * The board lists every active technician for the month whether or not they
 * have handed anything in — a list of only those who did answers the wrong
 * question. The one being asked is who has *not*.
 */
class TechnicianMonthlyReportController extends Controller
{
    /** Every technician for a month, handed in or not. */
    public function index(Request $request): JsonResponse
    {
        $period = TechnicianMonthlyReport::periodFor($request->string('period')->toString());

        $reports = TechnicianMonthlyReport::query()
            ->forPeriod($period)
            ->with(['receiver', 'recorder'])
            ->withCount('attachments')
            ->get()
            ->keyBy('technician_id');

        $rows = User::query()
            ->active()
            ->role(UserRole::Technician)
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(function (User $technician) use ($reports) {
                $report = $reports->get($technician->id);

                return [
                    'technician_id' => $technician->id,
                    'technician' => $technician->name,
                    'report' => $report ? $this->present($report) : null,
                ];
            });

        return response()->json([
            'data' => $rows,
            'meta' => [
                'period' => $period,
                'total' => $rows->count(),
                'received' => $rows->whereNotNull('report')->count(),
            ],
        ]);
    }

    /**
     * Record the handover, or correct it.
     *
     * One row per technician per month: signing the same month twice fixes
     * what is written rather than filing a second report for it.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'technician_id' => ['required', 'exists:users,id'],
            'period' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'received_by_user_id' => ['nullable', 'exists:users,id'],
            'received_on' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $report = TechnicianMonthlyReport::updateOrCreate(
            ['technician_id' => $data['technician_id'], 'period' => $data['period']],
            [
                'received_by_user_id' => $data['received_by_user_id'] ?? $request->user()->id,
                'received_on' => $data['received_on'] ?? now()->toDateString(),
                'notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ],
        );

        ActivityLog::record(
            'technician.report',
            $report,
            "استلام التقرير الشهري {$report->period} من {$report->technician?->name}",
        );

        return response()->json(
            ['data' => $this->present($report->load(['receiver', 'recorder'])->loadCount('attachments'))],
            $report->wasRecentlyCreated ? 201 : 200,
        );
    }

    /** Unsign a month recorded by mistake. The attachments go with it. */
    public function destroy(TechnicianMonthlyReport $technicianMonthlyReport): JsonResponse
    {
        $technicianMonthlyReport->delete();

        return response()->json(['message' => 'تم حذف تسجيل الاستلام.']);
    }

    /** @return array<string, mixed> */
    protected function present(TechnicianMonthlyReport $report): array
    {
        return [
            'id' => $report->id,
            'technician_id' => $report->technician_id,
            'period' => $report->period,
            'received_by' => $report->receiver?->name,
            'received_by_user_id' => $report->received_by_user_id,
            'received_on' => $report->received_on?->toDateString(),
            'notes' => $report->notes,
            'recorded_by' => $report->recorder?->name,
            'attachments_count' => $report->attachments_count ?? 0,
        ];
    }
}
