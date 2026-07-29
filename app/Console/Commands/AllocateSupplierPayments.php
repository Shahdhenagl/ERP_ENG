<?php

namespace App\Console\Commands;

use App\Models\SupplierInvoice;
use App\Models\SupplierPayment;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Put money already paid against the bills it was paying.
 *
 * Payments recorded before the invoice id reached the API all landed on account:
 * they lowered what the supplier was owed overall but settled no bill, so every
 * bill stayed on the chase list and got paid again. This walks them oldest
 * first and allocates each to the oldest open bill it covers in full.
 *
 * A payment that does not fit any single bill is left alone. Splitting one
 * across two would mean inventing a payment record nobody made.
 */
class AllocateSupplierPayments extends Command
{
    protected $signature = 'suppliers:allocate-payments
        {--supplier= : كود المورّد، أو اتركه فارغًا للجميع}
        {--dry-run : اعرض ما سيحدث دون تنفيذه}';

    protected $description = 'ربط الدفعات المسجّلة تحت الحساب بالفواتير التي تغطيها';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        $payments = SupplierPayment::query()
            ->whereNull('supplier_invoice_id')
            ->when($this->option('supplier'), fn ($q, $code) => $q->whereHas(
                'supplier',
                fn ($s) => $s->where('code', $code),
            ))
            ->with('supplier')
            ->orderBy('id')
            ->get();

        if ($payments->isEmpty()) {
            $this->info('لا توجد دفعات تحت الحساب.');

            return self::SUCCESS;
        }

        $allocated = 0;
        $skipped = 0;

        DB::transaction(function () use ($payments, $dry, &$allocated, &$skipped) {
            foreach ($payments as $payment) {
                $amount = round((float) $payment->amount, 2);

                // Re-read each time: an earlier allocation in this same run has
                // already changed what the next bill still owes.
                $bill = SupplierInvoice::query()
                    ->where('supplier_id', $payment->supplier_id)
                    ->where('status', 'posted')
                    ->orderBy('invoice_date')
                    ->orderBy('id')
                    ->get()
                    ->first(fn (SupplierInvoice $invoice) => $invoice->balance() + 0.005 >= $amount);

                if (! $bill) {
                    $skipped++;
                    $this->line("  {$payment->code} · {$payment->supplier?->name} · ".number_format($amount, 2).' — لا توجد فاتورة تغطيه، تُرك تحت الحساب');

                    continue;
                }

                $this->line("  {$payment->code} → {$bill->code} · ".number_format($amount, 2));

                if (! $dry) {
                    $payment->forceFill(['supplier_invoice_id' => $bill->id])->save();
                }

                $allocated++;
            }

            if ($dry) {
                DB::rollBack();
            }
        });

        $this->info(($dry ? '[معاينة] ' : '')."تم ربط {$allocated} دفعة، وتُركت {$skipped} تحت الحساب.");

        return self::SUCCESS;
    }
}
