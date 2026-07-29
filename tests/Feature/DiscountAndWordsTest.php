<?php

use App\Models\Customer;
use App\Models\Quotation;
use App\Models\User;
use App\Services\SalesService;

beforeEach(function () {
    $this->sales = app(SalesService::class);
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
});

function quoteWorth(float $unit, float $qty = 1, array $extra = []): Quotation
{
    $quotation = Quotation::create([
        'customer_id' => test()->customer->id,
        'created_by' => test()->manager->id,
        ...$extra,
    ]);

    $quotation->lines()->create([
        'description' => 'بند',
        'qty' => $qty,
        'unit_price' => $unit,
        'line_total' => round($qty * $unit, 2),
        'sort' => 0,
    ]);

    return test()->sales->recalculateQuotation($quotation);
}

it('takes a discount as a rate on the subtotal', function () {
    $quotation = quoteWorth(1000, 2, ['discount_percent' => 10]);

    expect((float) $quotation->subtotal)->toBe(2000.0)
        ->and((float) $quotation->discount)->toBe(200.0)
        ->and((float) $quotation->total)->toBe(1800.0);
});

it('follows the lines when a rate is used, and does not when an amount is', function () {
    $byRate = quoteWorth(1000, 1, ['discount_percent' => 10]);
    $byAmount = quoteWorth(1000, 1, ['discount' => 100]);

    // Double each quote's only line.
    foreach ([$byRate, $byAmount] as $quotation) {
        $quotation->lines()->update(['qty' => 2, 'line_total' => 2000]);
        $this->sales->recalculateQuotation($quotation);
    }

    // The rate moves with the subtotal; the agreed figure stays agreed.
    expect((float) $byRate->fresh()->discount)->toBe(200.0)
        ->and((float) $byAmount->fresh()->discount)->toBe(100.0);
});

it('never discounts more than the subtotal', function () {
    $quotation = quoteWorth(500, 1, ['discount' => 900]);

    expect((float) $quotation->discount)->toBe(500.0)
        ->and((float) $quotation->total)->toBe(0.0);
});
