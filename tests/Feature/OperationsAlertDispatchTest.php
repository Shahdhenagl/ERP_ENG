<?php

use App\Models\AlertDispatch;
use App\Models\User;
use App\Services\OperationsAlertDispatcher;
use App\Services\OperationsAlertScanner;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;

beforeEach(function () {
    Cache::flush();

    $this->manager = User::factory()->manager()->create();

    // One condition, so the ledger's behaviour is the only variable.
    $this->scanner = Mockery::mock(OperationsAlertScanner::class);
    $this->scanner->shouldReceive('scan')->andReturn(new Collection([[
        'key' => 'invoice-overdue-1',
        'type' => 'invoice.overdue',
        'title' => 'فاتورة متأخرة',
        'body' => 'INV-2026-0001',
        'url' => '/invoices/1',
        'tag' => 'invoice-1',
    ]]));

    $this->dispatcher = new OperationsAlertDispatcher($this->scanner);
});

it('alerts a condition once and never again', function () {
    Notification::fake();

    expect($this->dispatcher->dispatch())->toBe(1)
        // The same condition on the next sweep is not new — it is the same
        // overdue invoice, and re-alerting it every twenty minutes is how a
        // bell teaches people to ignore it.
        ->and($this->dispatcher->dispatch())->toBe(0);

    expect(AlertDispatch::where('key', 'invoice-overdue-1')->count())->toBe(1);
});

it('sweeps on traffic once, then holds off', function () {
    Notification::fake();

    $this->dispatcher->tick();
    $this->dispatcher->tick();

    // Throttled: the second call inside the window does no work at all, which
    // is what keeps this off the critical path of every page view.
    expect(AlertDispatch::count())->toBe(1);
});
