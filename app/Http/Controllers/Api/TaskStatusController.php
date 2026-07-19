<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Services\TaskWorkflow;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaskStatusController extends Controller
{
    public function __construct(protected TaskWorkflow $workflow) {}

    public function __invoke(Request $request, Task $task): TaskResource
    {
        $user = $request->user();

        $data = $request->validate([
            'status' => ['required', Rule::enum(TaskStatus::class)],
            'note' => ['nullable', 'string', 'max:1000'],
            'cancel_reason' => ['nullable', 'string', 'max:1000'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        $to = TaskStatus::from($data['status']);

        // Progress is a record of what happened in the field, so only the
        // technician who was there may move a job forward. Cancelling is the
        // opposite — a dispatch decision, usually made because the customer
        // called — so it stays with admins and managers.
        if ($to === TaskStatus::Cancelled) {
            abort_unless($user->canDispatch(), 403, 'الإلغاء من صلاحية المدير فقط.');
        } else {
            abort_unless(
                $user->isTechnician() && $task->assigned_to === $user->id,
                403,
                'تغيير حالة المهمة من صلاحية الفني المسندة إليه فقط.',
            );
        }

        $task = $this->workflow->transition(
            task: $task,
            to: $to,
            actor: $user,
            context: [
                'note' => $data['note'] ?? null,
                'cancel_reason' => $data['cancel_reason'] ?? null,
                'lat' => $data['lat'] ?? null,
                'lng' => $data['lng'] ?? null,
            ],
        );

        return new TaskResource($task->load(['customer', 'technician', 'creator', 'asset', 'statusLogs.user']));
    }
}
