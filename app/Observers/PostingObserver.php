<?php

namespace App\Observers;

use App\Enums\InvoiceStatus;
use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\StockMovement;
use App\Models\SupplierInvoice;
use App\Services\LedgerPoster;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Posting as a consequence of an operation rather than a step someone has to
 * remember.
 *
 * Every route that moves money already ends at one of these three models, so
 * watching the models covers the paths that exist today and the ones added
 * later — which a list of calls sprinkled through the services would not.
 *
 * One observer for all three rather than three near-identical ones: what the
 * models have in common is precisely that they are the things worth posting.
 *
 * A posting failure is logged and swallowed. That is a deliberate trade — the
 * documents are the record of the business and the ledger is derived from them,
 * so a chart that is briefly wrong must not stop a technician's job being
 * invoiced. `accounting:post` re-derives whatever was missed, and the accounting
 * screens report the gap rather than hiding it.
 */
class PostingObserver
{
    public function __construct(protected LedgerPoster $poster) {}

    /**
     * Both ledgers underneath are append-only, so creation is the whole of
     * their life: a correction arrives as another row and posts as another
     * entry. An invoice is the exception, and is handled on update too.
     */
    public function created(Model $model): void
    {
        $this->guard(fn () => match (true) {
            $model instanceof Invoice => $this->poster->invoice($model),
            $model instanceof CashMovement => $this->poster->cashMovement($model),
            $model instanceof StockMovement => $this->poster->stockMovement($model),
            $model instanceof SupplierInvoice => $this->poster->supplierInvoice($model),
            default => null,
        });
    }

    public function updated(Model $model): void
    {
        // A supplier bill posts when it stops being a draft, which is an
        // update — it is created empty and priced afterwards.
        if ($model instanceof SupplierInvoice) {
            if ($model->wasChanged('status')) {
                $this->guard(fn () => match ($model->status) {
                    'posted' => $this->poster->supplierInvoice($model),
                    'void' => $this->poster->supplierInvoiceVoided($model),
                    default => null,
                });
            }

            return;
        }

        if (! $model instanceof Invoice || ! $model->wasChanged('status')) {
            return;
        }

        $this->guard(fn () => match ($model->status) {
            InvoiceStatus::Issued => $this->poster->invoice($model),
            InvoiceStatus::Void => $this->poster->invoiceVoided($model),
            default => null,
        });
    }

    protected function guard(callable $post): void
    {
        try {
            $post();
        } catch (Throwable $exception) {
            Log::warning('تعذّر ترحيل قيد آلي: '.$exception->getMessage(), [
                'exception' => $exception,
            ]);
        }
    }
}
