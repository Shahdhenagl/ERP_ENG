<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\TaskReportResource;
use App\Models\ActivityLog;
use App\Models\Task;
use App\Models\TaskReport;
use App\Services\StockLedger;
use App\Services\TaskWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TaskReportController extends Controller
{
    public function __construct(
        protected TaskWorkflow $workflow,
        protected StockLedger $ledger,
    ) {}

    /**
     * File (or refile) the diagnosis / completion report. One report of each
     * type per job — resubmitting updates the existing one rather than piling
     * up duplicates.
     */
    public function store(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        abort_if(
            $user->isTechnician() && $task->assigned_to !== $user->id,
            403,
            'هذه المهمة غير مسندة إليك.',
        );

        $data = $request->validate([
            'type' => ['required', 'in:diagnosis,completion'],

            'input_voltage' => ['nullable', 'numeric', 'between:0,999999'],
            'output_voltage' => ['nullable', 'numeric', 'between:0,999999'],
            'frequency' => ['nullable', 'numeric', 'between:0,9999'],
            'load_percent' => ['nullable', 'numeric', 'between:0,999'],
            'battery_voltage' => ['nullable', 'numeric', 'between:0,999999'],
            'temperature' => ['nullable', 'numeric', 'between:-99,999'],
            'backup_minutes' => ['nullable', 'integer', 'min:0', 'max:100000'],

            'device_condition' => ['nullable', 'in:good,fair,poor,faulty'],
            'batteries_need_replacement' => ['boolean'],

            'findings' => ['nullable', 'string', 'max:5000'],
            'actions_taken' => ['nullable', 'string', 'max:5000'],
            'recommendations' => ['nullable', 'string', 'max:5000'],

            'parts_used' => ['nullable', 'array'],
            'parts_used.*.name' => ['required_with:parts_used', 'string', 'max:160'],
            'parts_used.*.qty' => ['nullable', 'numeric', 'min:0'],
            'parts_used.*.note' => ['nullable', 'string', 'max:500'],
            // Present when the part came off the van; absent for something
            // bought on the way, which stock knows nothing about.
            'parts_used.*.item_id' => ['nullable', 'exists:items,id'],

            'signed_by_name' => ['nullable', 'string', 'max:160'],
            // Base64 data URL captured from the on-screen signature pad.
            'signature' => ['nullable', 'string'],
        ]);

        $data['user_id'] = $user->id;

        if ($signature = $data['signature'] ?? null) {
            $data['signature_path'] = $this->storeSignature($task, $signature);
            $data['signed_at'] = now();
        }

        unset($data['signature']);

        $report = TaskReport::updateOrCreate(
            ['task_id' => $task->id, 'type' => $data['type']],
            $data,
        );

        // Deduct what the technician says they fitted, from their own custody.
        // Reconciled rather than deducted, so editing the report corrects the
        // balance instead of consuming the parts a second time.
        if ($user->isTechnician() && $task->assigned_to === $user->id) {
            $this->ledger->syncTaskConsumption($task, $data['parts_used'] ?? [], $user);
        }

        ActivityLog::record(
            'task.report_filed',
            $task,
            "{$task->code}: تم رفع تقرير ".($data['type'] === 'diagnosis' ? 'التشخيص' : 'الإنهاء'),
        );

        // Filing the completion report *is* finishing the job. Making the
        // technician then press a separate button left work sitting open,
        // because from where they stand the job is already done.
        if (
            $data['type'] === 'completion'
            && $task->status === TaskStatus::InProgress
            && $user->isTechnician()
            && $task->assigned_to === $user->id
        ) {
            $this->workflow->transition($task, TaskStatus::Completed, $user);
        }

        return response()->json(
            new TaskReportResource($report->load('author', 'attachments')),
            201,
        );
    }

    /** Decode a `data:image/png;base64,...` payload into the public disk. */
    protected function storeSignature(Task $task, string $dataUrl): ?string
    {
        if (! preg_match('/^data:image\/(png|jpeg);base64,/', $dataUrl, $matches)) {
            return null;
        }

        $binary = base64_decode(
            substr($dataUrl, strpos($dataUrl, ',') + 1),
            strict: true,
        );

        if ($binary === false) {
            return null;
        }

        $path = "signatures/task-{$task->id}-".now()->timestamp.'.'.$matches[1];
        Storage::disk('public')->put($path, $binary);

        return $path;
    }
}
