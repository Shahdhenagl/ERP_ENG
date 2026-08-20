<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\ContractPayment;
use App\Models\InstallmentWorkflow;
use App\Models\WorkflowStepCompletion;
use App\Models\WorkflowTemplate;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class WorkflowController extends Controller
{
    public function templates(): JsonResponse
    {
        return response()->json([
            'data' => WorkflowTemplate::query()
                ->with('steps')
                ->where('is_active', true)
                ->orderBy('name')
                ->get()
                ->map(fn (WorkflowTemplate $template) => $this->templatePayload($template)),
        ]);
    }

    public function storeTemplate(Request $request): JsonResponse
    {
        $data = $this->validateTemplate($request);
        $steps = $data['steps'] ?? [];
        unset($data['steps']);
        $data['created_by'] = $request->user()->id;

        $template = DB::transaction(function () use ($data, $steps) {
            $template = WorkflowTemplate::create($data);
            $this->replaceTemplateSteps($template, $steps);
            return $template;
        });

        return response()->json(['data' => $this->templatePayload($template->load('steps'))], 201);
    }

    public function updateTemplate(Request $request, WorkflowTemplate $workflowTemplate): JsonResponse
    {
        $data = $this->validateTemplate($request);
        $steps = $data['steps'] ?? null;
        unset($data['steps']);

        DB::transaction(function () use ($workflowTemplate, $data, $steps) {
            $workflowTemplate->update($data);
            if ($steps !== null) {
                $this->replaceTemplateSteps($workflowTemplate, $steps);
            }
        });

        return response()->json(['data' => $this->templatePayload($workflowTemplate->fresh('steps'))]);
    }

    public function destroyTemplate(WorkflowTemplate $workflowTemplate): JsonResponse
    {
        if ($workflowTemplate->installmentWorkflows()->exists()) {
            throw ValidationException::withMessages([
                'workflow' => Terms::get('لا يمكن حذف قالب مستخدم في دفعات. عطّله بدلًا من حذفه.'),
            ]);
        }

        $workflowTemplate->delete();
        return response()->json(['message' => Terms::get('تم حذف قالب الإجراءات.')]);
    }

    public function show(Request $request, Contract $contract, ContractPayment $payment): JsonResponse
    {
        $this->assertPaymentBelongsTo($contract, $payment);

        $workflow = $payment->installmentWorkflow()->with([
            'template.steps',
            'steps.completer',
            'steps.attachments.uploader',
        ])->first();

        return response()->json(['data' => $workflow ? $this->workflowPayload($workflow) : null]);
    }

    public function assign(Request $request, Contract $contract, ContractPayment $payment): JsonResponse
    {
        $this->assertPaymentBelongsTo($contract, $payment);
        if ($payment->isCollected()) {
            throw ValidationException::withMessages([
                'workflow' => Terms::get('لا يمكن تغيير إجراءات دفعة محصّلة.'),
            ]);
        }

        $data = $request->validate([
            'workflow_template_id' => ['required', 'exists:workflow_templates,id'],
        ]);
        $template = WorkflowTemplate::with('steps')->where('is_active', true)->findOrFail($data['workflow_template_id']);

        $workflow = DB::transaction(function () use ($payment, $template, $request) {
            $workflow = $payment->installmentWorkflow()->first();
            if (! $workflow) {
                $workflow = $payment->installmentWorkflow()->create([
                    'workflow_template_id' => $template->id,
                    'status' => 'pending',
                ]);
            } else {
                $workflow->update(['workflow_template_id' => $template->id, 'status' => 'pending', 'completed_at' => null, 'completed_by' => null]);
                $workflow->steps()->delete();
            }

            foreach ($template->steps as $step) {
                $workflow->steps()->create([
                    'name' => $step->name,
                    'description' => $step->description,
                    'sort_order' => $step->sort_order,
                    'is_required' => $step->is_required,
                ]);
            }

            return $workflow->load(['template.steps', 'steps.completer', 'steps.attachments.uploader']);
        });

        return response()->json(['data' => $this->workflowPayload($workflow)]);
    }

    public function updateStep(Request $request, WorkflowStepCompletion $workflowStepCompletion): JsonResponse
    {
        $data = $request->validate([
            'completed' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $workflow = $workflowStepCompletion->workflow;
        $workflowStepCompletion->update([
            'completed_at' => $data['completed'] ? now() : null,
            'completed_by' => $data['completed'] ? $request->user()->id : null,
            'notes' => $data['notes'] ?? null,
        ]);
        $workflow->refreshStatus();

        return response()->json([
            'data' => $this->workflowPayload($workflow->fresh(['template.steps', 'steps.completer', 'steps.attachments.uploader'])),
        ]);
    }

    /** @return array<string, mixed> */
    protected function validateTemplate(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['sometimes', 'boolean'],
            'steps' => ['required', 'array', 'min:1', 'max:50'],
            'steps.*.name' => ['required', 'string', 'max:160'],
            'steps.*.description' => ['nullable', 'string', 'max:1000'],
            'steps.*.sort_order' => ['nullable', 'integer', 'min:0'],
            'steps.*.is_required' => ['sometimes', 'boolean'],
        ]);
    }

    protected function replaceTemplateSteps(WorkflowTemplate $template, array $steps): void
    {
        $template->steps()->delete();
        foreach (array_values($steps) as $index => $step) {
            $template->steps()->create([
                'name' => $step['name'],
                'description' => $step['description'] ?? null,
                'sort_order' => $step['sort_order'] ?? $index,
                'is_required' => $step['is_required'] ?? true,
            ]);
        }
    }

    protected function assertPaymentBelongsTo(Contract $contract, ContractPayment $payment): void
    {
        abort_unless((int) $payment->contract_id === (int) $contract->id, 404);
    }

    /** @return array<string, mixed> */
    protected function templatePayload(WorkflowTemplate $template): array
    {
        return [
            'id' => $template->id,
            'name' => $template->name,
            'description' => $template->description,
            'is_active' => (bool) $template->is_active,
            'steps' => $template->relationLoaded('steps') ? $template->steps->map(fn ($step) => [
                'id' => $step->id,
                'name' => $step->name,
                'description' => $step->description,
                'sort_order' => $step->sort_order,
                'is_required' => (bool) $step->is_required,
            ])->values() : [],
        ];
    }

    /** @return array<string, mixed> */
    protected function workflowPayload(InstallmentWorkflow $workflow): array
    {
        return [
            'id' => $workflow->id,
            'status' => $workflow->status,
            'completed_at' => $workflow->completed_at?->toIso8601String(),
            'template' => $workflow->relationLoaded('template') ? $this->templatePayload($workflow->template) : null,
            'steps' => $workflow->relationLoaded('steps') ? $workflow->steps->map(fn (WorkflowStepCompletion $step) => [
                'id' => $step->id,
                'name' => $step->name,
                'description' => $step->description,
                'sort_order' => $step->sort_order,
                'is_required' => (bool) $step->is_required,
                'completed' => $step->completed_at !== null,
                'completed_at' => $step->completed_at?->toIso8601String(),
                'completed_by' => $step->completer?->name,
                'notes' => $step->notes,
                'attachments' => $step->relationLoaded('attachments') ? $step->attachments->map(fn ($attachment) => [
                    'id' => $attachment->id,
                    'url' => $attachment->url,
                    'is_image' => $attachment->is_image,
                    'original_name' => $attachment->original_name,
                    'mime' => $attachment->mime,
                    'size' => $attachment->size,
                    'caption' => $attachment->caption,
                ])->values() : [],
            ])->values() : [],
        ];
    }
}

