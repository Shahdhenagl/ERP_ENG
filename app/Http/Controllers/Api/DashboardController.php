<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\TaskResource;
use App\Http\Resources\ContractResource;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\FollowUp;
use App\Models\Task;
use App\Models\User;
use App\Models\Warranty;
use App\Services\MaintenancePlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __construct(protected MaintenancePlanner $planner) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        // No cron on this host, so due maintenance visits are turned into work
        // orders off the back of traffic. Throttled to once every 15 minutes,
        // so most requests pay nothing for this.
        $this->planner->tick();
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
            // Contract visits are cut ahead of their date, so both of these are
            // held to what a dispatcher could act on this fortnight. Counting
            // every future visit would turn a signed contract into a badge full
            // of work nobody is meant to touch yet.
            'unassigned' => $user->canDispatch()
                ? Task::query()->open()->actionable()->whereNull('assigned_to')->count()
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
            ->with(['customer', 'technician', 'asset'])
            ->open()
            ->actionable()
            ->orderByRaw("FIELD(priority, 'urgent','high','normal','low')")
            ->orderByRaw('scheduled_at IS NULL, scheduled_at ASC')
            ->limit(8)
            ->get();

        $payload = [
            'stats' => $stats,
            'upcoming' => TaskResource::collection($upcoming)->resolve(),
        ];

        if ($user->canDispatch()) {
            // The answer to "which contract visits need a technician putting on
            // them" — the reason the whole contract feature exists.
            //
            // No horizon here on purpose: a work order only exists once the
            // planner decided the visit was near enough, so filtering again
            // would hide jobs that are already cut and waiting.
            $visitsDue = Task::query()
                ->whereNotNull('contract_id')
                ->open()
                ->whereNull('assigned_to')
                ->with(['customer', 'contract'])
                ->orderByRaw('scheduled_at IS NULL, scheduled_at ASC')
                ->limit(10)
                ->get();

            $payload['maintenance_due'] = TaskResource::collection($visitsDue)->resolve();
            $stats['maintenance_due'] = $visitsDue->count();
            $stats['contracts_active'] = Contract::query()->activeOn(now()->toDateString())->count();
            $stats['contracts_expiring'] = Contract::query()->expiringWithin(60)->count();

            $payload['contracts_expiring'] = ContractResource::collection(
                Contract::query()->expiringWithin(60)->with('customer')->orderBy('ends_on')->limit(5)->get(),
            )->resolve();

            // Cover about to lapse is money waiting to be asked for: an
            // extension is sellable while the customer still feels covered, and
            // worthless the day after. Sixty days matches the contract horizon.
            $expiringCover = Warranty::query()
                ->expiringWithin(60)
                ->with(['asset', 'customer'])
                ->orderBy('ends_on')
                ->limit(5)
                ->get();

            $stats['warranties_expiring'] = Warranty::query()->expiringWithin(60)->count();

            $payload['warranties_expiring'] = $expiringCover->map(fn (Warranty $warranty) => [
                'id' => $warranty->id,
                'code' => $warranty->code,
                'asset' => $warranty->asset?->label(),
                'asset_code' => $warranty->asset?->code,
                'customer' => $warranty->customer?->name,
                'ends_on' => $warranty->ends_on?->toDateString(),
                'days_remaining' => $warranty->daysRemaining(),
            ])->values();

            // A promise to call someone back, past its date. The same logic as
            // the cover chase list, one step earlier in the relationship: this
            // is the person you said you would get back to and have not.
            if ($user->hasPermission('crm.manage')) {
                $due = FollowUp::query()
                    ->due()
                    ->with(['subject', 'owner'])
                    ->orderBy('due_at')
                    ->limit(5)
                    ->get();

                $stats['follow_ups_due'] = FollowUp::query()->due()->count();

                $payload['follow_ups_due'] = $due->map(fn (FollowUp $f) => [
                    'id' => $f->id,
                    'type_label' => $f->typeLabel(),
                    'subject' => $f->subjectName(),
                    'subject_type' => array_search($f->subject_type, [
                        'lead' => \App\Models\Lead::class,
                        'customer' => \App\Models\Customer::class,
                    ], true) ?: null,
                    'subject_id' => $f->subject_id,
                    'due_at' => $f->due_at?->toDateString(),
                    'owner' => $f->owner?->name,
                ])->values();
            }

            $payload['stats'] = $stats;
        }

        return response()->json($payload);
    }
}
