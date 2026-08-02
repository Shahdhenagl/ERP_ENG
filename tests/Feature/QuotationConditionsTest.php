<?php

use App\Models\Customer;
use App\Models\Quotation;
use App\Models\Setting;
use App\Models\User;

/**
 * The standing conditions are a starting point, not a fixture. An offer states
 * its own, and what it stated is what it prints — a quote read a year later
 * must show what was agreed, not what the company defaults to today.
 */
beforeEach(function () {
    $this->actingAs(User::factory()->create(['role' => 'admin']));
    $this->customer = Customer::factory()->create();
});

it('keeps the conditions written on the offer', function () {
    $response = $this->postJson('/api/quotations', [
        'customer_id' => $this->customer->id,
        'conditions' => [
            ['label' => 'طريقة السداد', 'value' => '50% مقدم و50% عند التسليم'],
            ['label' => 'الضمان', 'value' => 'سنتان'],
        ],
        'lines' => [['description' => 'جهاز UPS', 'qty' => 1, 'unit_price' => 1000]],
    ])->assertCreated();

    $quotation = Quotation::find($response->json('data.id'));

    expect($quotation->conditions)->toHaveCount(2)
        ->and($quotation->conditions[0]['value'])->toBe('50% مقدم و50% عند التسليم');
});

it('accepts a condition with no value, to be filled in by hand', function () {
    $response = $this->postJson('/api/quotations', [
        'customer_id' => $this->customer->id,
        'conditions' => [['label' => 'مدة التوريد', 'value' => '']],
        'lines' => [['description' => 'جهاز UPS', 'qty' => 1, 'unit_price' => 1000]],
    ])->assertCreated();

    // Stored as null, not '': Laravel converts empty request strings to
    // null, and the sheet reads either as "nothing stated" — a dotted rule.
    expect(Quotation::find($response->json('data.id'))->conditions[0]['value'])->toBeNull();
});

it('rejects a condition with no name', function () {
    $this->postJson('/api/quotations', [
        'customer_id' => $this->customer->id,
        'conditions' => [['label' => '', 'value' => 'شيء ما']],
        'lines' => [['description' => 'جهاز UPS', 'qty' => 1, 'unit_price' => 1000]],
    ])->assertStatus(422)->assertJsonValidationErrors('conditions.0.label');
});

it('lets a draft change its conditions without touching the company set', function () {
    Setting::put(['quotation_conditions' => json_encode([
        ['label' => 'الضمان', 'value' => 'عام من تاريخ التوريد'],
    ], JSON_UNESCAPED_UNICODE)]);

    $id = $this->postJson('/api/quotations', [
        'customer_id' => $this->customer->id,
        'lines' => [['description' => 'جهاز UPS', 'qty' => 1, 'unit_price' => 1000]],
    ])->assertCreated()->json('data.id');

    $quotation = Quotation::findOrFail($id);

    $this->putJson("/api/quotations/{$quotation->id}", [
        'customer_id' => $this->customer->id,
        'conditions' => [['label' => 'الضمان', 'value' => 'ثلاث سنوات']],
        'lines' => [['description' => 'جهاز UPS', 'qty' => 1, 'unit_price' => 1000]],
    ])->assertOk();

    expect($quotation->fresh()->conditions[0]['value'])->toBe('ثلاث سنوات')
        ->and(Setting::values()['quotation_conditions'])
        ->toContain('عام من تاريخ التوريد');
});
