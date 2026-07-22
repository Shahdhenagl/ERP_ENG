<?php

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Enums\TaskStatus;
use App\Models\Contract;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\StockMovement;
use App\Models\Task;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Illuminate\Support\Facades\DB;

/**
 * The reports, and nothing else.
 *
 * One rule holds this together: **a report never recomputes a figure a service
 * already owns.** Cash comes from TreasuryReport, the period's profit from
 * FinancialReports, custody from CustodyService. A second calculation of the
 * same number is a second answer, and the day they disagree is the day nobody
 * trusts either.
 *
 * What is left is genuine aggregation — sales by customer, stock that has not
 * moved, contracts running out — and that is what lives here.
 */
class ReportService
{
    public function __construct(
        protected FinancialReports $books,
        protected TreasuryReport $treasury,
        protected CustodyService $custody,
        protected SupplierBilling $payables,
    ) {}

    /* ── Sales ───────────────────────────────────────────── */

    /**
     * What was invoiced over a period, and who it was invoiced to.
     *
     * Draft invoices are excluded throughout: nobody has been told they owe
     * anything, so counting them would report sales that have not happened.
     *
     * @return array<string, mixed>
     */
    public function sales(?string $from = null, ?string $to = null): array
    {
        $issued = $this->issuedInvoices($from, $to);

        $totals = (clone $issued)
            ->selectRaw('count(*) as invoices, coalesce(sum(subtotal), 0) as subtotal,
                         coalesce(sum(discount), 0) as discount,
                         coalesce(sum(tax_amount), 0) as tax,
                         coalesce(sum(total), 0) as total')
            ->first();

        $collected = (float) DB::table('payments')
            ->whereIn('invoice_id', (clone $issued)->select('id'))
            ->sum('amount');

        // By customer, biggest first — the list a manager actually reads.
        $byCustomer = (clone $issued)
            ->join('customers', 'customers.id', '=', 'invoices.customer_id')
            ->groupBy('customers.id', 'customers.name')
            ->selectRaw('customers.id, customers.name,
                         count(*) as invoices, coalesce(sum(invoices.total), 0) as total')
            ->orderByDesc('total')
            ->limit(20)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => $row->name,
                'invoices' => (int) $row->invoices,
                'total' => round((float) $row->total, 2),
            ]);

        $byItem = DB::table('invoice_lines')
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->whereNull('invoices.deleted_at')
            ->where('invoices.status', InvoiceStatus::Issued->value)
            ->when($from, fn ($q) => $q->whereDate('invoices.issue_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('invoices.issue_date', '<=', $to))
            ->leftJoin('items', 'items.id', '=', 'invoice_lines.item_id')
            // Grouped by description where there is no stock item behind the
            // line, which is how labour and visit fees appear.
            ->groupBy('invoice_lines.item_id', 'items.name', 'invoice_lines.description')
            ->selectRaw('invoice_lines.item_id, items.name as item_name,
                         invoice_lines.description,
                         coalesce(sum(invoice_lines.qty), 0) as qty,
                         coalesce(sum(invoice_lines.line_total), 0) as total')
            ->orderByDesc('total')
            ->limit(20)
            ->get()
            ->map(fn ($row) => [
                'item_id' => $row->item_id ? (int) $row->item_id : null,
                'name' => $row->item_name ?? $row->description,
                'qty' => round((float) $row->qty, 3),
                'total' => round((float) $row->total, 2),
            ]);

        $total = round((float) $totals->total, 2);

        return [
            'period' => ['from' => $from, 'to' => $to],
            'invoices' => (int) $totals->invoices,
            'subtotal' => round((float) $totals->subtotal, 2),
            'discount' => round((float) $totals->discount, 2),
            'tax' => round((float) $totals->tax, 2),
            'total' => $total,
            'collected' => round($collected, 2),
            'outstanding' => round($total - $collected, 2),
            'average_invoice' => $totals->invoices > 0
                ? round($total / (int) $totals->invoices, 2)
                : 0.0,
            'by_customer' => $byCustomer,
            'by_item' => $byItem,
        ];
    }

    /* ── Profitability ───────────────────────────────────── */

    /**
     * Revenue against the cost of the parts that produced it.
     *
     * The period figures come from the income statement rather than being
     * summed here, so the report and the books cannot disagree. The per-job
     * breakdown underneath is the part the books cannot answer: which visits
     * were worth making.
     *
     * @return array<string, mixed>
     */
    public function profitability(?string $from = null, ?string $to = null): array
    {
        $statement = $this->books->incomeStatement($from, $to);

        // Every billed job, with the parts it consumed valued at what they cost
        // when they were issued — not at today's average, which would rewrite
        // last quarter's margin every time something is bought.
        $jobs = Invoice::query()
            ->where('status', InvoiceStatus::Issued->value)
            ->whereNotNull('task_id')
            ->when($from, fn ($q) => $q->whereDate('issue_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('issue_date', '<=', $to))
            ->with(['customer', 'task'])
            ->get()
            ->map(function (Invoice $invoice) {
                $cost = round((float) StockMovement::where('task_id', $invoice->task_id)
                    ->where('type', 'issue')
                    ->selectRaw('coalesce(sum(qty * unit_cost), 0) as total')
                    ->value('total'), 2);

                $revenue = round((float) $invoice->subtotal - (float) $invoice->discount, 2);

                return [
                    'invoice_id' => $invoice->id,
                    'code' => $invoice->code,
                    'task_code' => $invoice->task?->code,
                    'customer' => $invoice->customer?->name,
                    'date' => $invoice->issue_date?->toDateString(),
                    'revenue' => $revenue,
                    'parts_cost' => $cost,
                    'margin' => round($revenue - $cost, 2),
                    // Guarded: a job billed at zero would divide by nothing.
                    'margin_pct' => $revenue > 0
                        ? round((($revenue - $cost) / $revenue) * 100, 1)
                        : 0.0,
                ];
            })
            ->sortByDesc('margin')
            ->values();

        return [
            'period' => ['from' => $from, 'to' => $to],
            'revenue' => $statement['revenue_total'],
            'cost_of_sales' => $statement['cost_of_sales_total'],
            'gross_profit' => $statement['gross_profit'],
            'expenses' => $statement['expenses_total'],
            'net_profit' => $statement['net_profit'],
            'gross_margin_pct' => $statement['revenue_total'] > 0
                ? round(($statement['gross_profit'] / $statement['revenue_total']) * 100, 1)
                : 0.0,
            'jobs' => $jobs,
            'jobs_revenue' => round($jobs->sum('revenue'), 2),
            'jobs_cost' => round($jobs->sum('parts_cost'), 2),
        ];
    }

    /* ── Stock ───────────────────────────────────────────── */

    /**
     * What is on the shelves, what is running out, and what is not moving.
     *
     * `$idleDays` is what turns a valuation into a decision: stock nobody has
     * touched in three months is money sitting in a corner, and it is invisible
     * on a balance sheet that only shows a total.
     *
     * @return array<string, mixed>
     */
    public function stock(int $idleDays = 90): array
    {
        $items = Item::query()->active()->with('levels.warehouse')->get();

        $byWarehouse = DB::table('stock_levels')
            ->join('warehouses', 'warehouses.id', '=', 'stock_levels.warehouse_id')
            ->join('items', 'items.id', '=', 'stock_levels.item_id')
            ->groupBy('warehouses.id', 'warehouses.name', 'warehouses.type')
            ->selectRaw('warehouses.id, warehouses.name, warehouses.type,
                         coalesce(sum(stock_levels.qty), 0) as qty,
                         coalesce(sum(stock_levels.qty * items.avg_cost), 0) as value')
            ->orderByDesc('value')
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => $row->name,
                'type' => $row->type,
                'type_label' => $row->type === 'van' ? 'عهدة فني' : 'مخزن',
                'qty' => round((float) $row->qty, 3),
                'value' => round((float) $row->value, 2),
            ]);

        $cutoff = now()->subDays($idleDays)->toDateString();

        $idle = $items
            ->filter(fn (Item $item) => $item->totalQty() > 0)
            ->filter(fn (Item $item) => ! StockMovement::where('item_id', $item->id)
                ->whereDate('created_at', '>=', $cutoff)
                ->exists())
            ->map(fn (Item $item) => [
                'id' => $item->id,
                'code' => $item->code,
                'name' => $item->name,
                'qty' => $item->totalQty(),
                'unit' => $item->unit,
                'value' => $item->stockValue(),
                'last_movement' => StockMovement::where('item_id', $item->id)
                    ->max('created_at'),
            ])
            ->sortByDesc('value')
            ->values();

        $consumed = DB::table('stock_movements')
            ->join('items', 'items.id', '=', 'stock_movements.item_id')
            ->where('stock_movements.type', 'issue')
            ->groupBy('items.id', 'items.name', 'items.unit')
            ->selectRaw('items.id, items.name, items.unit,
                         coalesce(sum(stock_movements.qty), 0) as qty,
                         coalesce(sum(stock_movements.qty * stock_movements.unit_cost), 0) as value')
            ->orderByDesc('value')
            ->limit(20)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => $row->name,
                'unit' => $row->unit,
                'qty' => round((float) $row->qty, 3),
                'value' => round((float) $row->value, 2),
            ]);

        $below = $items
            ->filter(fn (Item $item) => $item->isBelowReorderLevel())
            ->map(fn (Item $item) => [
                'id' => $item->id,
                'code' => $item->code,
                'name' => $item->name,
                'qty' => $item->totalQty(),
                'unit' => $item->unit,
                'reorder_level' => (float) $item->reorder_level,
                'shortfall' => round((float) $item->reorder_level - $item->totalQty(), 3),
            ])
            ->sortByDesc('shortfall')
            ->values();

        return [
            'idle_days' => $idleDays,
            'total_value' => round($items->sum(fn (Item $item) => $item->stockValue()), 2),
            'items_count' => $items->count(),
            'by_warehouse' => $byWarehouse,
            'below_reorder' => $below,
            'idle' => $idle,
            'idle_value' => round($idle->sum('value'), 2),
            'most_consumed' => $consumed,
        ];
    }

    /* ── Custody ─────────────────────────────────────────── */

    /**
     * What every technician is holding. Read straight from CustodyService —
     * this report exists to total it, not to compute it a second way.
     *
     * @return array<string, mixed>
     */
    public function custody(): array
    {
        $statements = collect($this->custody->allStatements());

        return [
            'technicians' => $statements->values(),
            'cash_total' => round($statements->sum(fn ($row) => $row['cash']['balance']), 2),
            'stock_total' => round($statements->sum(fn ($row) => $row['stock']['value']), 2),
            'devices_total' => $statements->sum(fn ($row) => count($row['devices'])),
            'total_value' => round($statements->sum(fn ($row) => $row['total_value']), 2),
        ];
    }

    /* ── Contracts ───────────────────────────────────────── */

    /**
     * Which contracts are running, which are running out, and whether the
     * visits they promised are actually being made.
     *
     * @return array<string, mixed>
     */
    public function contracts(int $expiringWithin = 60): array
    {
        $contracts = Contract::query()
            ->where('status', 'active')
            ->with('customer')
            ->withCount([
                'visits',
                'visits as done_count' => fn ($q) => $q->where('status', 'done'),
                'visits as overdue_count' => fn ($q) => $q
                    ->whereIn('status', ['planned', 'scheduled'])
                    ->whereDate('planned_for', '<', now()->toDateString()),
            ])
            ->get()
            ->map(fn (Contract $contract) => [
                'id' => $contract->id,
                'code' => $contract->code,
                'customer' => $contract->customer?->name,
                'label' => $contract->label,
                'starts_on' => $contract->starts_on?->toDateString(),
                'ends_on' => $contract->ends_on?->toDateString(),
                'days_remaining' => $contract->daysRemaining(),
                'effective_status' => $contract->effectiveStatus(),
                'value' => (float) $contract->value,
                'visits' => $contract->visits_count,
                'visits_done' => $contract->done_count,
                'visits_overdue' => $contract->overdue_count,
                // The number that says whether the contract is being honoured.
                'compliance_pct' => $contract->visits_count > 0
                    ? round(($contract->done_count / $contract->visits_count) * 100, 1)
                    : 0.0,
            ]);

        $breaches = Task::query()->slaBreached()->count();

        return [
            'expiring_within' => $expiringWithin,
            'active' => $contracts->where('effective_status', 'active')->count(),
            'expiring' => $contracts
                ->filter(fn ($row) => $row['days_remaining'] >= 0 && $row['days_remaining'] <= $expiringWithin)
                ->values(),
            'expired' => $contracts->where('effective_status', 'expired')->values(),
            'annual_value' => round($contracts->sum('value'), 2),
            'visits_overdue' => $contracts->sum('visits_overdue'),
            'sla_breaches' => $breaches,
            'rows' => $contracts->sortBy('days_remaining')->values(),
        ];
    }

    /* ── Warranties ──────────────────────────────────────── */

    /**
     * Cover running out, and what the claims under it have cost.
     *
     * Warranty work is the expensive kind: it is done, it is not billed, and
     * without a number attached nobody notices a model that keeps failing.
     *
     * @return array<string, mixed>
     */
    public function warranties(int $expiringWithin = 60): array
    {
        $expiring = Warranty::query()
            ->expiringWithin($expiringWithin)
            ->with(['asset', 'customer'])
            ->orderBy('ends_on')
            ->get()
            ->map(fn (Warranty $warranty) => [
                'id' => $warranty->id,
                'code' => $warranty->code,
                'asset' => $warranty->asset?->label(),
                'asset_code' => $warranty->asset?->code,
                'customer' => $warranty->customer?->name,
                'ends_on' => $warranty->ends_on?->toDateString(),
                'days_remaining' => $warranty->daysRemaining(),
                'kind_label' => $warranty->kind->label(),
            ]);

        $claims = WarrantyClaim::query()->with(['asset', 'task'])->get();

        // The parts consumed on repair orders raised from claims — the direct
        // cost of honouring the cover.
        $repairCost = round((float) StockMovement::query()
            ->where('type', 'issue')
            ->whereIn('task_id', $claims->pluck('task_id')->filter())
            ->selectRaw('coalesce(sum(qty * unit_cost), 0) as total')
            ->value('total'), 2);

        $byStatus = $claims
            ->groupBy(fn (WarrantyClaim $claim) => $claim->status->value)
            ->map(fn ($group, $status) => [
                'status' => $status,
                'label' => $group->first()->status->label(),
                'count' => $group->count(),
            ])
            ->values();

        // Repeat offenders: a model claimed against more than once is either a
        // bad batch or a bad fit for the site.
        $byModel = $claims
            ->filter(fn (WarrantyClaim $claim) => $claim->asset !== null)
            ->groupBy(fn (WarrantyClaim $claim) => trim(
                ($claim->asset->brand ?? '').' '.($claim->asset->model ?? ''),
            ) ?: 'غير محدد')
            ->map(fn ($group, $model) => ['model' => $model, 'claims' => $group->count()])
            ->sortByDesc('claims')
            ->values();

        // Compared on the enum's value, not the enum: a backed enum is not
        // loosely equal to its own string in PHP 8, so `where('status', 'open')`
        // silently counts nothing.
        $withStatus = fn (array $wanted) => $claims
            ->filter(fn (WarrantyClaim $claim) => in_array($claim->status->value, $wanted, true))
            ->count();

        return [
            'expiring_within' => $expiringWithin,
            'active_cover' => Warranty::query()->effective()->count(),
            'expiring' => $expiring,
            'claims_total' => $claims->count(),
            'claims_open' => $withStatus(['open', 'approved']),
            'repairs' => $withStatus(['repaired']),
            'replacements' => $withStatus(['replaced']),
            'rejected' => $withStatus(['rejected']),
            'repair_cost' => $repairCost,
            'by_status' => $byStatus,
            'by_model' => $byModel,
        ];
    }

    /* ── Internals ───────────────────────────────────────── */

    /** Issued invoices in a window — the base every sales figure counts from. */
    protected function issuedInvoices(?string $from, ?string $to)
    {
        return Invoice::query()
            ->where('status', InvoiceStatus::Issued->value)
            ->when($from, fn ($q) => $q->whereDate('issue_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('issue_date', '<=', $to));
    }
}
