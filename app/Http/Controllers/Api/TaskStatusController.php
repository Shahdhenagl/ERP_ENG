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

        // Technicians drive their own jobs; managers may intervene on any job.
        abort_if(
            $user->isTechnician() && $task->assigned_to !== $user->id,
            403,
            'هذه المهمة غير مسندة إليك.',
        );

        $data = $request->validate([
            'status' => ['required', Rule::enum(TaskStatus::class)],
            'note' => ['nullable', 'string', 'max:1000'],
            'cancel_reason' => ['nullable', 'string', 'max:1000'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        $task = $this->workflow->transition(
            task: $task,
            to: TaskStatus::from($data['status']),
            actor: $user,
            context: [
                'note' => $data['note'] ?? null,
                'cancel_reason' => $data['cancel_reason'] ?? null,
                'lat' => $data['lat'] ?? null,
                'lng' => $data['lng'] ?? null,
            ],
        );

        return new TaskResource($task->load(['customer', 'technician', 'creator', 'statusLogs.user']));
    }
}
