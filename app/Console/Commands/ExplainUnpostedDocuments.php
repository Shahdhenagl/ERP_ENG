<?php

namespace App\Console\Commands;

use App\Enums\MovementType;
use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\StockMovement;
use App\Services\FinancialReports;
use Illuminate\Console\Command;

/**
 * Name the documents the journal has no entry for, and say why.
 *
 * "5 documents pending" beside a button that posts 0 of them is the shape of
 * this problem: the counter asks whether an entry exists, the poster decides
 * whether one can be written, and where they disagree a document is stuck on
 * the banner forever. This reports the disagreement instead of hiding it.
 */
class ExplainUnpostedDocuments extends Command
{
    protected $signature = 'accounting:unposted';

    protected $description = 'عرض المستندات التي لم تُرحَّل إلى دفتر اليومية وسبب توقفها';

    public function handle(FinancialReports $reports): int
    {
        $counts = $reports->unposted();

        if (array_sum($counts) === 0) {
            $this->info('كل المستندات مُرحَّلة.');

            return self::SUCCESS;
        }

        $this->line('');
        $this->line("فواتير: {$counts['invoices']} · حركات نقدية: {$counts['cash_movements']} · حركات مخزون: {$counts['stock_movements']}");
        $this->line('');

        $rows = [];

        foreach ($reports->unpostedInvoices() as $invoice) {
            $rows[] = ['فاتورة', $invoice->code, number_format((float) $invoice->total, 2), $this->invoiceReason($invoice)];
        }

        foreach ($reports->unpostedCashMovements() as $movement) {
            $rows[] = [
                'حركة نقدية',
                "#{$movement->id} · {$movement->source}",
                number_format((float) $movement->amount, 2),
                $this->cashReason($movement),
            ];
        }

        foreach ($reports->unpostedStockMovements() as $movement) {
            $rows[] = [
                'حركة مخزون',
                "#{$movement->id} · {$movement->type->value}",
                number_format((float) $movement->qty * (float) $movement->unit_cost, 2),
                $this->stockReason($movement),
            ];
        }

        $this->table(['النوع', 'المستند', 'القيمة', 'السبب'], $rows);

        return self::SUCCESS;
    }

    protected function invoiceReason(Invoice $invoice): string
    {
        if ((float) $invoice->total <= 0) {
            return 'قيمة الفاتورة صفر — لا يوجد ما يُرحَّل';
        }

        if ($invoice->lines()->count() === 0) {
            return 'الفاتورة بلا بنود';
        }

        return 'جاهزة للترحيل — اضغط «ترحيل الآن»';
    }

    protected function cashReason(CashMovement $movement): string
    {
        if (! $movement->box) {
            return 'الخزنة المرتبطة بها محذوفة';
        }

        $paired = in_array($movement->source, ['transfer', 'custody_advance', 'custody_settle'], true);

        if ($paired && ! $movement->counterpart_box_id) {
            return 'تحويل بلا خزنة مقابلة — لا وجهة معلومة';
        }

        if ($paired && ! $movement->counterpartBox) {
            return 'الخزنة المقابلة محذوفة';
        }

        if ((float) $movement->amount <= 0) {
            return 'المبلغ صفر';
        }

        return 'جاهزة للترحيل — اضغط «ترحيل الآن»';
    }

    protected function stockReason(StockMovement $movement): string
    {
        if (round((float) $movement->qty * (float) $movement->unit_cost, 2) <= 0) {
            return 'قيمة الحركة صفر — صنف بلا تكلفة مسجّلة';
        }

        if ($movement->type === MovementType::Transfer) {
            return 'تحويل بين مخازن — لا أثر محاسبي';
        }

        return 'جاهزة للترحيل — اضغط «ترحيل الآن»';
    }
}
