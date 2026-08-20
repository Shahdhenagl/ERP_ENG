<?php

use App\Models\CashBox;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\User;
use App\Models\WorkflowTemplate;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->customer = Customer::factory()->create();
    CashBox::default();
});

function workflowDraftContract(): Contract
{
    actingAs(test()->manager)->postJson('/api/contracts', [
        'customer_id' => test()->customer->id,
        'title' => 'عقد إجراءات تحصيل',
        'starts_on' => now()->toDateString(),
        'ends_on' => now()->addYear()->subDay()->toDateString(),
        'visits_per_year' => 12,
        'value' => 40000,
        'billing_frequency' => 'quarterly',
        'collection_timing' => 'arrears',
    ])->assertCreated();

    return Contract::latest('id')->first();
}

it('creates reusable workflow templates and snapshots steps on a payment', function () {
    $response = actingAs($this->manager)->postJson('/api/workflow-templates', [
        'name' => 'إجراءات كود 1',
        'description' => 'إجراءات قانونية قبل التحصيل',
        'steps' => [
            ['name' => 'مراجعة المستندات', 'is_required' => true],
            ['name' => 'اعتماد الإدارة', 'is_required' => true],
        ],
    ])->assertCreated();

    $templateId = $response->json('data.id');
    expect(WorkflowTemplate::find($templateId)->steps)->toHaveCount(2);

    $contract = workflowDraftContract();
    $payment = $contract->payments()->first();

    actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/payments/{$payment->id}/workflow", [
            'workflow_template_id' => $templateId,
        ])
        ->assertOk()
        ->assertJsonCount(2, 'data.steps')
        ->assertJsonPath('data.status', 'pending');

    expect($payment->fresh()->installmentWorkflow->steps)->toHaveCount(2);
});

it('blocks arrears collection when the payment workflow has required steps open', function () {
    $template = WorkflowTemplate::create([
        'name' => 'إجراءات التحصيل',
        'created_by' => $this->manager->id,
    ]);
    $template->steps()->create(['name' => 'مراجعة قانونية', 'sort_order' => 0, 'is_required' => true]);

    $contract = workflowDraftContract();
    $payment = $contract->payments()->first();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/payments/{$payment->id}/workflow", [
        'workflow_template_id' => $template->id,
    ])->assertOk();

    actingAs($this->manager)
        ->postJson("/api/contracts/{$contract->id}/payments/{$payment->id}/collect", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors('payment');
});

it('updates a workflow step with completion and notes', function () {
    $template = WorkflowTemplate::create(['name' => 'إجراءات كود 2', 'created_by' => $this->manager->id]);
    $template->steps()->create(['name' => 'إرفاق خطاب المطالبة', 'sort_order' => 0, 'is_required' => true]);

    $contract = workflowDraftContract();
    $payment = $contract->payments()->first();
    actingAs($this->manager)->postJson("/api/contracts/{$contract->id}/payments/{$payment->id}/workflow", [
        'workflow_template_id' => $template->id,
    ])->assertOk();

    $step = $payment->fresh()->installmentWorkflow->steps()->first();
    actingAs($this->manager)
        ->patchJson("/api/workflow-steps/{$step->id}", [
            'completed' => true,
            'notes' => 'تمت مراجعة المستندات وإرفاق أصل الخطاب.',
        ])
        ->assertOk()
        ->assertJsonPath('data.status', 'completed')
        ->assertJsonPath('data.steps.0.completed', true)
        ->assertJsonPath('data.steps.0.notes', 'تمت مراجعة المستندات وإرفاق أصل الخطاب.');
});
