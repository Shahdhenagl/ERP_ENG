<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ReportService;
use App\Services\TreasuryReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function __construct(
        protected ReportService $reports,
        protected TreasuryReport $treasury,
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

        [$name, $headings, $rows] = match ($report) {
            'sales' => $this->salesRows($from, $to),
            'profitability' => $this->profitabilityRows($from, $to),
            'stock' => $this->stockRows($request->integer('idle_days') ?: 90),
            'custody' => $this->custodyRows(),
            'contracts' => $this->contractRows($request->integer('days') ?: 60),
            'warranties' => $this->warrantyRows($request->integer('days') ?: 60),
            default => abort(404, 'تقرير غير معروف.'),
        };

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
            ['العميل', 'عدد الفواتير', 'الإجمالي'],
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
            ['الفاتورة', 'أمر العمل', 'العميل', 'التاريخ', 'الإيراد', 'تكلفة القطع', 'الربح', 'الهامش %'],
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
            ['المخزن', 'النوع', 'الكمية', 'القيمة'],
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
            ['الفني', 'نقدية', 'قيمة القطع', 'عدد الأجهزة', 'الإجمالي'],
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
            ['الكود', 'العميل', 'يبدأ', 'ينتهي', 'الأيام المتبقية', 'الزيارات', 'المنفذة', 'المتأخرة', 'الالتزام %'],
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
            ['الكود', 'الجهاز', 'العميل', 'ينتهي في', 'الأيام المتبقية', 'النوع'],
            collect($report['expiring'])->map(fn ($row) => [
                $row['code'], $row['asset'], $row['customer'],
                $row['ends_on'], $row['days_remaining'], $row['kind_label'],
            ]),
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
