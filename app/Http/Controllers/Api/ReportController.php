<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CustomReportService;
use App\Services\ReportService;
use App\Services\TreasuryReport;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function __construct(
        protected ReportService $reports,
        protected TreasuryReport $treasury,
        protected CustomReportService $custom,
    ) {}

    public function sales(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);

        return response()->json(['data' => $this->reports->sales($from, $to)]);
    }

    public function profitability(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);

        return response()->json(['data' => $this->reports->profitability($from, $to)]);
    }

    public function stock(Request $request): JsonResponse
    {
        $request->validate(['idle_days' => ['nullable', 'integer', 'min:7', 'max:365']]);

        return response()->json([
            'data' => $this->reports->stock($request->integer('idle_days') ?: 90),
        ]);
    }

    public function custody(): JsonResponse
    {
        return response()->json(['data' => $this->reports->custody()]);
    }

    public function contracts(Request $request): JsonResponse
    {
        $request->validate(['days' => ['nullable', 'integer', 'min:7', 'max:365']]);

        return response()->json([
            'data' => $this->reports->contracts($request->integer('days') ?: 60),
        ]);
    }

    public function warranties(Request $request): JsonResponse
    {
        $request->validate(['days' => ['nullable', 'integer', 'min:7', 'max:365']]);

        return response()->json([
            'data' => $this->reports->warranties($request->integer('days') ?: 60),
        ]);
    }

    public function crm(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);

        return response()->json(['data' => $this->reports->crm($from, $to)]);
    }

    public function hr(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);

        return response()->json(['data' => $this->reports->hr($from, $to)]);
    }

    public function maintenance(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);

        return response()->json(['data' => $this->reports->maintenance($from, $to)]);
    }

    public function periodicMaintenance(Request $request): JsonResponse
    {
        $filters = $this->periodicMaintenanceFilters($request);

        return response()->json([
            'data' => $this->reports->periodicMaintenance($filters['branch_ids'], $filters['month']),
        ]);
    }

    /** The standby-power estate at a glance — the operations dashboard. */
    public function operations(): JsonResponse
    {
        return response()->json(['data' => $this->reports->operations()]);
    }

    public function taskMovements(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);

        return response()->json(['data' => $this->reports->taskMovements($from, $to)]);
    }

    /**
     * Any report's own table, as a spreadsheet.
     *
     * This is what «التقارير المخصصة» resolves to in practice. A general report
     * builder is months of work and produces queries nobody can check; handing
     * over the rows lets whoever needs a different cut make it in the tool they
     * already use for exactly that.
     */
    public function export(Request $request, string $report): StreamedResponse
    {
        [$from, $to] = $this->window($request);

        if ($report === 'periodic-maintenance') {
            $filters = $this->periodicMaintenanceFilters($request);
            [$name, $headings, $rows] = $this->periodicMaintenanceRows(
                $filters['branch_ids'],
                $filters['month'],
            );

            return $this->stream($name, $headings, $rows);
        }

        [$name, $headings, $rows] = match ($report) {
            'sales' => $this->salesRows($from, $to),
            'profitability' => $this->profitabilityRows($from, $to),
            'stock' => $this->stockRows($request->integer('idle_days') ?: 90),
            'custody' => $this->custodyRows(),
            'contracts' => $this->contractRows($request->integer('days') ?: 60),
            'warranties' => $this->warrantyRows($request->integer('days') ?: 60),
            'crm' => $this->crmRows($from, $to),
            'hr' => $this->hrRows($from, $to),
            'maintenance' => $this->maintenanceRows($from, $to),
            'task-movements' => $this->taskMovementsRows($from, $to),
            default => abort(404, 'تقرير غير معروف.'),
        };

        return $this->stream($name, $headings, $rows);
    }

    /* ── Custom reports: raw rows of a dataset ───────────── */

    /** The datasets a custom export can pull, for the picker. */
    public function datasets(): JsonResponse
    {
        return response()->json(['data' => CustomReportService::catalogue()]);
    }

    /**
     * Any whitelisted dataset's records, filtered to a window, as a spreadsheet.
     *
     * This is «التقارير المخصصة» made concrete: not a query builder, but the raw
     * rows of a known table handed over to be cut however the reader needs.
     */
    public function customExport(Request $request, string $dataset): StreamedResponse
    {
        abort_unless(CustomReportService::exists($dataset), 404, 'مجموعة بيانات غير معروفة.');

        [$from, $to] = $this->window($request);
        [$name, $headings, $rows] = $this->custom->rows($dataset, $from, $to);

        return $this->stream($name, $headings, $rows);
    }

    /**
     * Stream rows as a BOM-prefixed CSV Excel opens without mangling Arabic.
     *
     * @param  array<int, string>  $headings
     * @param  iterable<int, array<int, mixed>>  $rows
     */
    protected function stream(string $name, array $headings, iterable $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($headings, $rows) {
            $handle = fopen('php://output', 'w');

            // Excel reads a CSV as the system codepage unless the file says
            // otherwise, and Arabic then arrives as mojibake. The BOM is what
            // makes a double-click open it correctly.
            fwrite($handle, "\xEF\xBB\xBF");

            fputcsv($handle, $headings);

            foreach ($rows as $row) {
                fputcsv($handle, $row);
            }

            fclose($handle);
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /* ── Rows for export ─────────────────────────────────── */

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function salesRows(?string $from, ?string $to): array
    {
        $report = $this->reports->sales($from, $to);

        return [
            'sales-'.($from ?? 'all').'.csv',
            [Terms::get('العميل'), Terms::get('عدد الفواتير'), Terms::get('الإجمالي')],
            collect($report['by_customer'])
                ->map(fn ($row) => [$row['name'], $row['invoices'], $row['total']]),
        ];
    }

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function profitabilityRows(?string $from, ?string $to): array
    {
        $report = $this->reports->profitability($from, $to);

        return [
            'profitability-'.($from ?? 'all').'.csv',
            [Terms::get('الفاتورة'), Terms::get('أمر العمل'), Terms::get('العميل'), Terms::get('التاريخ'), Terms::get('الإيراد'), Terms::get('تكلفة القطع'), Terms::get('الربح'), Terms::get('الهامش %')],
            collect($report['jobs'])->map(fn ($row) => [
                $row['code'], $row['task_code'], $row['customer'], $row['date'],
                $row['revenue'], $row['parts_cost'], $row['margin'], $row['margin_pct'],
            ]),
        ];
    }

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function stockRows(int $idleDays): array
    {
        $report = $this->reports->stock($idleDays);

        return [
            'stock.csv',
            [Terms::get('المخزن'), Terms::get('النوع'), Terms::get('الكمية'), Terms::get('القيمة')],
            collect($report['by_warehouse'])->map(fn ($row) => [
                $row['name'], $row['type_label'], $row['qty'], $row['value'],
            ]),
        ];
    }

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function custodyRows(): array
    {
        $report = $this->reports->custody();

        return [
            'custody.csv',
            [Terms::get('الفني'), Terms::get('نقدية'), Terms::get('قيمة القطع'), Terms::get('عدد الأجهزة'), Terms::get('الإجمالي')],
            collect($report['technicians'])->map(fn ($row) => [
                $row['technician']['name'],
                $row['cash']['balance'],
                $row['stock']['value'],
                count($row['devices']),
                $row['total_value'],
            ]),
        ];
    }

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function contractRows(int $days): array
    {
        $report = $this->reports->contracts($days);

        return [
            'contracts.csv',
            [Terms::get('الكود'), Terms::get('العميل'), Terms::get('يبدأ'), Terms::get('ينتهي'), Terms::get('الأيام المتبقية'), Terms::get('الزيارات'), Terms::get('المنفذة'), Terms::get('المتأخرة'), Terms::get('الالتزام %')],
            collect($report['rows'])->map(fn ($row) => [
                $row['code'], $row['customer'], $row['starts_on'], $row['ends_on'],
                $row['days_remaining'], $row['visits'], $row['visits_done'],
                $row['visits_overdue'], $row['compliance_pct'],
            ]),
        ];
    }

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function warrantyRows(int $days): array
    {
        $report = $this->reports->warranties($days);

        return [
            'warranties.csv',
            [Terms::get('الكود'), Terms::get('الجهاز'), Terms::get('العميل'), Terms::get('ينتهي في'), Terms::get('الأيام المتبقية'), Terms::get('النوع')],
            collect($report['expiring'])->map(fn ($row) => [
                $row['code'], $row['asset'], $row['customer'],
                $row['ends_on'], $row['days_remaining'], $row['kind_label'],
            ]),
        ];
    }

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function crmRows(?string $from, ?string $to): array
    {
        $report = $this->reports->crm($from, $to);

        return [
            'crm-'.($from ?? 'all').'.csv',
            [Terms::get('المصدر'), Terms::get('إجمالي العملاء المحتملين'), Terms::get('المكسوبون'), Terms::get('نسبة التحويل %')],
            collect($report['by_source'])->map(fn ($row) => [
                $row['label'], $row['total'], $row['won'], $row['conversion_pct'],
            ]),
        ];
    }

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function hrRows(?string $from, ?string $to): array
    {
        $report = $this->reports->hr($from, $to);

        return [
            'hr-'.($from ?? 'all').'.csv',
            [Terms::get('القسم'), Terms::get('عدد الموظفين'), Terms::get('إجمالي الرواتب')],
            collect($report['by_department'])->map(fn ($row) => [
                $row['department'], $row['count'], $row['payroll'],
            ]),
        ];
    }

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function maintenanceRows(?string $from, ?string $to): array
    {
        $report = $this->reports->maintenance($from, $to);

        return [
            'maintenance-'.($from ?? 'all').'.csv',
            [Terms::get('الحالة'), Terms::get('عدد أوامر العمل')],
            collect($report['tasks']['by_status'])->map(fn ($row) => [
                $row['label'], $row['count'],
            ]),
        ];
    }

    /** @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>} */
    protected function periodicMaintenanceRows(array $branchIds, string $month): array
    {
        $report = $this->reports->periodicMaintenance($branchIds, $month);

        return [
            'periodic-maintenance-'.$month.'.csv',
            [
                'م', 'العميل', 'الفرع', 'المكان', 'الشهر السابق', 'الشهر الحالي',
                'موقف الصيانة', 'استلام التقرير', 'موعد الزيارة الحالي', 'المهندس',
            ],
            collect($report['rows'])->values()->map(function ($row, $index) {
                $previous = $row['previous'];
                $current = $row['current'];

                return [
                    $index + 1,
                    $row['customer'],
                    $row['branch'],
                    $row['location'],
                    $previous['status_label'].' · '.$previous['completed'].'/'.$previous['tasks_total'],
                    $current['status_label'].' · '.$current['completed'].'/'.$current['tasks_total'],
                    $current['status_label'],
                    $current['reports_received'].'/'.$current['tasks_total'],
                    $current['visit_date'],
                    implode('، ', $current['technicians']),
                ];
            }),
        ];
    }

    /** @return array{branch_ids: array<int, int>, month: string} */
    protected function periodicMaintenanceFilters(Request $request): array
    {
        $filters = $request->validate([
            'month' => ['required', 'date_format:Y-m'],
            'branch_ids' => ['required', 'array', 'min:1'],
            'branch_ids.*' => ['integer', 'distinct', 'exists:branches,id'],
        ]);

        return [
            'branch_ids' => array_map('intval', $filters['branch_ids']),
            'month' => $filters['month'],
        ];
    }

    /** @return array{0: ?string, 1: ?string} */
    protected function window(Request $request): array
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        return [$filters['from'] ?? null, $filters['to'] ?? null];
    }
}
