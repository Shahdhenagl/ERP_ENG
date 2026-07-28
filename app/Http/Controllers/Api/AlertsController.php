<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\OperationsAlertScanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;

/**
 * The operational alerts board — the standing conditions a manager acts on:
 * stock shortages, urgent and delayed jobs, maintenance and contract deadlines,
 * warranties lapsing, money overdue, and anything waiting on a sign-off.
 *
 * This is not the bell. The bell keeps the ordinary notification history; this
 * reads the live conditions, grouped, from the same scanner the daily sweep uses.
 */
class AlertsController extends Controller
{
    /** The board's sections, in the order they are shown, with the types each holds. */
    protected const GROUPS = [
        ['key' => 'stock', 'label' => 'نواقص المخزون', 'types' => ['stock.low']],
        ['key' => 'tasks', 'label' => 'مهام عاجلة ومتأخرة', 'types' => ['task.urgent', 'device.fault', 'task.delayed']],
        ['key' => 'maintenance', 'label' => 'الصيانة الدورية والعقود', 'types' => ['ppm.due', 'contract.payment_due']],
        ['key' => 'warranties', 'label' => 'الضمانات', 'types' => ['warranty.expiring']],
        ['key' => 'finance', 'label' => 'متأخرات السداد', 'types' => ['invoice.overdue', 'expense.recurring_due']],
        ['key' => 'approvals', 'label' => 'بانتظار الاعتماد', 'types' => ['approval.needed']],
    ];

    public function __construct(protected OperationsAlertScanner $scanner) {}

    public function index(): JsonResponse
    {
        // Opening the board also lets the daily sweep run — throttled and deduped
        // through the dispatch ledger — so the managers still get the alert as a
        // notification on a host that has no cron.
        $this->sweepOnce();

        // "New invoice" is informational; it belongs in the bell, not on a board
        // of things that need acting on.
        $alerts = $this->scanner->scan()->reject(fn ($a) => $a['type'] === 'invoice.created');

        $groups = collect(self::GROUPS)
            ->map(function (array $group) use ($alerts) {
                $items = $alerts->whereIn('type', $group['types'])
                    ->map(fn ($a) => [
                        'type' => $a['type'],
                        'title' => $a['title'],
                        'body' => $a['body'],
                        'url' => $a['url'],
                    ])->values();

                return [
                    'key' => $group['key'],
                    'label' => $group['label'],
                    'count' => $items->count(),
                    'items' => $items,
                ];
            })
            ->filter(fn ($group) => $group['count'] > 0)
            ->values();

        return response()->json([
            'data' => ['groups' => $groups, 'total' => $alerts->count()],
        ]);
    }

    /** Run the notification sweep at most once every 15 minutes. */
    protected function sweepOnce(): void
    {
        if (Cache::add('alerts-sweep-throttle', true, now()->addMinutes(15))) {
            try {
                Artisan::call('alerts:sweep');
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
