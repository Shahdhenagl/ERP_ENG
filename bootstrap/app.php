<?php

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withSchedule(function (Schedule $schedule): void {
        // Early enough that a due follow-up is on the person's screen before
        // the working day starts, once per day so it never turns into noise.
        $schedule->command('follow-ups:remind')->dailyAt('07:30');

        // The operations sweep — faults, due maintenance, expiring warranties,
        // overdue invoices, low parts — once a day, deduplicated so a standing
        // condition alerts once, not every morning.
        $schedule->command('alerts:sweep')->dailyAt('07:00');
    })
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureUserRole::class,
            'can' => \App\Http\Middleware\EnsurePermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
