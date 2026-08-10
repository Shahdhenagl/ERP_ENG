<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\TaskResource;
use App\Http\Resources\ContractResource;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\FollowUp;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Task;
use App\Models\User;
use App\Models\Warranty;
use App\Services\MaintenancePlanner;
use App\Services\OperationsAlertDispatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __construct(
        protected MaintenancePlanner $planner,
        protected OperationsAlertDispatcher $alerts,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        // No cron on this host, so due maintenance visits are turned into work
        // orders off the back of traffic. Throttled to once every 15 minutes,
        // so most requests pay nothing for this.
        $this->planner->tick();
        // Conditions become alerts here too. Nothing schedules alerts:sweep
        // on this host, so an overdue invoice would sit on the board for
        // ever and never ring a bell.
        $this->alerts->tick();
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

        $year = $request->integer('year') ?: (int) now()->year;
        $month = $request->integer('month') ?: (int) now()->month;
        $targetDate = \Carbon\Carbon::createFromDate($year, $month, 1);

        $stats = [
            'by_status' => $counts,
            'open_total' => array_sum(array_intersect_key($counts, array_flip($openStatuses))),
            'completed_today' => $scoped()
                ->where('status', TaskStatus::Completed->value)
                ->whereDate('completed_at', today())
                ->count(),
            'completed_this_month' => $scoped()
                ->where('status', TaskStatus::Completed->value)
                ->whereBetween('completed_at', [$targetDate->copy()->startOfMonth(), $targetDate->copy()->endOfMonth()])
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
                ? Task::query()->open()->actionable()->doesntHave('technicians')->count()
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
            ->with(['customer', 'technicians', 'asset'])
            ->open()
            ->actionable()
            // Live work first. Ordered by date alone, a job being driven to
            // fell below eight rows of things scheduled sooner — which is the
            // one row a technician opening this screen is looking for.
            ->orderByRaw("FIELD(status, 'in_progress','on_the_way','accepted','pending')")
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
                ->doesntHave('technicians')
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

            // Quotes a salesperson has handed over and cannot send until someone
            // signs them off. Every hour one sits here is an hour the customer
            // is waiting, so it belongs beside the other things needing an act.
            $awaitingApproval = \App\Models\Quotation::query()
                ->pendingApproval()
                ->with('customer')
                ->orderBy('submitted_at')
                ->limit(5)
                ->get();

            $stats['pending_approvals'] = \App\Models\Quotation::query()->pendingApproval()->count();
            $payload['pending_approvals'] = $awaitingApproval->map(fn ($q) => [
                'id' => $q->id,
                'code' => $q->code,
                'customer' => $q->customer?->name,
                'title' => $q->title,
                'total' => (float) $q->total,
                'submitted_at' => $q->submitted_at?->toIso8601String(),
            ]);

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

            // Today's field attendance, straight off the technicians' own
            // check-ins — who is in, when they punched, and from where.
            $attendanceToday = \App\Models\Attendance::query()
                ->whereDate('date', today())
                ->whereNotNull('check_in')
                ->with('employee:id,name,code')
                ->orderByDesc('check_out')
                ->orderBy('check_in')
                ->get();

            // ── Standing alerts: the conditions the manager acts on ──
            // Shortages, delayed jobs and overdue money — the same conditions the
            // daily sweep raises, surfaced live on the board.
            $lowStock = Item::query()->active()->belowReorderLevel()
                ->orderBy('name')->limit(8)->get();
            $stats['low_stock'] = Item::query()->active()->belowReorderLevel()->count();
            $payload['low_stock'] = $lowStock->map(fn (Item $i) => [
                'id' => $i->id,
                'name' => $i->name,
                'qty' => $i->totalQty(),
                'unit' => $i->unit,
                'reorder_level' => (float) $i->reorder_level,
            ])->values();

            $delayed = Task::query()->open()->slaBreached()->with('customer')
                ->orderBy('resolution_due_at')->limit(8)->get();
            $stats['delayed'] = Task::query()->open()->slaBreached()->count();
            $payload['delayed_tasks'] = $delayed->map(fn (Task $t) => [
                'id' => $t->id,
                'code' => $t->code,
                'customer' => $t->customer?->name,
                'title' => $t->title,
            ])->values();

            $overdue = Invoice::query()->overdue()->with('customer')
                ->orderBy('due_date')->limit(8)->get();
            $stats['overdue_invoices'] = Invoice::query()->overdue()->count();
            $payload['overdue_invoices'] = $overdue->map(fn (Invoice $i) => [
                'id' => $i->id,
                'code' => $i->code,
                'customer' => $i->customer?->name,
                'balance' => $i->balance(),
                'due_date' => $i->due_date?->toDateString(),
            ])->values();

            $stats['checked_in_today'] = $attendanceToday->count();
            $stats['on_site_now'] = $attendanceToday->whereNull('check_out')->count();

            $payload['attendance_today'] = $attendanceToday->map(fn (\App\Models\Attendance $a) => [
                'id' => $a->id,
                'employee' => $a->employee?->name,
                'employee_code' => $a->employee?->code,
                'check_in' => $a->check_in ? substr((string) $a->check_in, 0, 5) : null,
                'check_out' => $a->check_out ? substr((string) $a->check_out, 0, 5) : null,
                'status' => $a->status->value,
                'status_label' => $a->statusLabel(),
                'worked_hours' => (float) $a->worked_hours,
                // A map link the dispatcher can open, only when a stamp carried
                // one. Both ends: leaving is as worth seeing as arriving, and a
                // punch-out from home after a punch-in on site is exactly the
                // thing a manager is looking at this list for.
                'check_in_location' => $a->check_in_lat !== null
                    ? ['lat' => (float) $a->check_in_lat, 'lng' => (float) $a->check_in_lng]
                    : null,
                'check_out_location' => $a->check_out_lat !== null
                    ? ['lat' => (float) $a->check_out_lat, 'lng' => (float) $a->check_out_lng]
                    : null,
            ])->values();

            $payload['stats'] = $stats;
        }

        return response()->json($payload);
    }
}
