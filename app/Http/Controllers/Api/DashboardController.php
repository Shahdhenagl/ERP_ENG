<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\TaskResource;
use App\Models\Customer;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $scoped = fn () => Task::query()->when(
            $user->isTechnician(),
            fn ($q) => $q->forTechnician($user->id),
        );

        // One grouped query instead of six counts.
        $byStatus = $scoped()
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $counts = [];

        foreach (TaskStatus::cases() as $status) {
            $counts[$status->value] = (int) ($byStatus[$status->value] ?? 0);
        }

        $openStatuses = [
            TaskStatus::Pending->value,
            TaskStatus::Accepted->value,
            TaskStatus::OnTheWay->value,
            TaskStatus::InProgress->value,
        ];

        $stats = [
            'by_status' => $counts,
            'open_total' => array_sum(array_intersect_key($counts, array_flip($openStatuses))),
            'completed_today' => $scoped()
                ->where('status', TaskStatus::Completed->value)
                ->whereDate('completed_at', today())
                ->count(),
            'completed_this_month' => $scoped()
                ->where('status', TaskStatus::Completed->value)
                ->whereBetween('completed_at', [now()->startOfMonth(), now()->endOfMonth()])
                ->count(),
            'overdue' => $scoped()
                ->open()
                ->whereNotNull('scheduled_at')
                ->where('scheduled_at', '<', now())
                ->count(),
            'unassigned' => $user->canDispatch()
                ? Task::query()->open()->whereNull('assigned_to')->count()
                : 0,
        ];

        if ($user->canDispatch()) {
            $stats['customers_total'] = Customer::query()->active()->count();
            $stats['technicians_total'] = User::query()->active()->role(\App\Enums\UserRole::Technician)->count();

            // Per-technician workload — drives the dispatcher's capacity view.
            $stats['technician_load'] = User::query()
                ->active()
                ->role(\App\Enums\UserRole::Technician)
                ->withCount([
                    'assignedTasks as open_count' => fn ($q) => $q->open(),
                    'assignedTasks as completed_count' => fn ($q) => $q->where('status', TaskStatus::Completed->value),
                ])
                ->orderByDesc('open_count')
                ->limit(10)
                ->get(['id', 'name', 'job_title'])
                ->map(fn ($t) => [
                    'id' => $t->id,
                    'name' => $t->name,
                    'job_title' => $t->job_title,
                    'open_count' => $t->open_count,
                    'completed_count' => $t->completed_count,
                ]);
        }

        // What needs attention right now.
        $upcoming = $scoped()
            ->with(['customer', 'technician'])
            ->open()
            ->orderByRaw("FIELD(priority, 'urgent','high','normal','low')")
            ->orderByRaw('scheduled_at IS NULL, scheduled_at ASC')
            ->limit(8)
            ->get();

        return response()->json([
            'stats' => $stats,
            'upcoming' => TaskResource::collection($upcoming)->resolve(),
        ]);
    }
}
