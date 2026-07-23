<?php

namespace App\Providers;

use App\Models\CashMovement;
use App\Models\Invoice;
use App\Models\StockMovement;
use App\Models\PayrollRun;
use App\Models\SalesReturn;
use App\Models\SupplierInvoice;
use App\Models\Task;
use App\Observers\PostingObserver;
use App\Observers\TaskObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Task::observe(TaskObserver::class);

        // The three things whose creation means money moved. Posting hangs off
        // the models rather than the services so a new path into any of them
        // reaches the journal without anyone having to remember it.
        Invoice::observe(PostingObserver::class);
        CashMovement::observe(PostingObserver::class);
        StockMovement::observe(PostingObserver::class);
        SupplierInvoice::observe(PostingObserver::class);
        SalesReturn::observe(PostingObserver::class);
        PayrollRun::observe(PostingObserver::class);
    }
}
