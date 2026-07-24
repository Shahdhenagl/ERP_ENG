<?php

namespace App\Http\Controllers\Api;

use App\Enums\VisitStatus;
use App\Http\Controllers\Controller;
use App\Models\ContractVisit;
use App\Services\MaintenancePlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Preventive maintenance, read as a schedule.
 *
 * The planning engine already turns contracts into dated visits and cuts work
 * orders for the near ones; this surfaces that plan — what is coming, what has
 * slipped, and how much of what was due actually got done — and lets a manager
 * cut the due work orders on demand rather than waiting for the next sweep.
 */
class PpmController extends Controller
{
    public function __construct(protected MaintenancePlanner $planner) {}

    /** The visit calendar, newest-due first, cancelled ones left out. */
    public function visits(Request $request): JsonResponse
    {
        $today = now()->toDateString();

        $visits = ContractVisit::query()
            ->where('status', '!=', VisitStatus::Cancelled->value)
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->integer('contract_id'), fn ($q, $id) => $q->where('contract_id', $id))
            ->when(
                $request->boolean('overdue'),
                fn ($q) => $q->whereIn('status', ['planned', 'scheduled'])->whereDate('planned_for', '<', $today),
            )
            ->when(
                $request->has('within'),
                fn ($q) => $q->whereIn('status', ['planned', 'scheduled'])
                    ->whereDate('planned_for', '<=', now()->addDays($request->integer('within', 30))->toDateString()),
            )
            ->with(['contract.customer', 'task'])
            ->orderBy('planned_for')
            ->limit(300)
            ->get()
            ->map(fn (ContractVisit $visit) => $this->present($visit));

        return response()->json(['data' => $visits]);
    }

    public function summary(): JsonResponse
    {
        $today = now()->toDateString();
        $live = ContractVisit::query()->where('status', '!=', VisitStatus::Cancelled->value);

        $open = fn () => (clone $live)->whereIn('status', ['planned', 'scheduled']);

        $done = (clone $live)->where('status', VisitStatus::Done->value)->count();
        $overdue = (clone $open())->whereDate('planned_for', '<', $today)->count();

        return response()->json([
            'planned' => (clone $live)->where('status', VisitStatus::Planned->value)->count(),
            'scheduled' => (clone $live)->where('status', VisitStatus::Scheduled->value)->count(),
            'done' => $done,
            'skipped' => (clone $live)->where('status', VisitStatus::Skipped->value)->count(),
            'overdue' => $overdue,
            'upcoming_30' => (clone $open())
                ->whereBetween('planned_for', [$today, now()->addDays(30)->toDateString()])
                ->count(),
            // Of the visits that were due by now, the share carried out.
            'compliance' => ($done + $overdue) ? round($done / ($done + $overdue) * 100, 1) : null,
        ]);
    }

    /** Cut work orders for every visit now inside the horizon. */
    public function run(): JsonResponse
    {
        $created = $this->planner->materialiseDueVisits();

        return response()->json([
            'message' => $created ? "تم إصدار {$created} أمر عمل." : 'لا توجد زيارات مستحقة حاليًا.',
            'created' => $created,
        ]);
    }

    /** @return array<string, mixed> */
    protected function present(ContractVisit $visit): array
    {
        $today = now()->startOfDay();
        $open = in_array($visit->status, [VisitStatus::Planned, VisitStatus::Scheduled], true);

        return [
            'id' => $visit->id,
            'contract_id' => $visit->contract_id,
            'contract_code' => $visit->contract?->code,
            'customer' => $visit->contract?->customer?->name,

            'sequence' => $visit->sequence,
            'planned_for' => $visit->planned_for?->toDateString(),
            'status' => $visit->status->value,
            'status_label' => $visit->status->label(),
            'is_overdue' => $open && $visit->planned_for !== null && $visit->planned_for->lt($today),

            'task_id' => $visit->task_id,
            'task_code' => $visit->task?->code,
            'task_status' => $visit->task?->status?->value,
            'task_status_label' => $visit->task?->status?->label(),
        ];
    }
}
