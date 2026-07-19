<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TaskAttachmentResource;
use App\Models\Task;
use App\Models\TaskAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TaskAttachmentController extends Controller
{
    /** Upload before/after photos or supporting documents against a job. */
    public function store(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        abort_if(
            $user->isTechnician() && $task->assigned_to !== $user->id,
            403,
            'هذه المهمة غير مسندة إليك.',
        );

        $request->validate([
            'files' => ['required', 'array', 'max:10'],
            'files.*' => ['file', 'max:8192', 'mimes:jpg,jpeg,png,webp,heic,pdf'],
            'kind' => ['required', 'in:before,after,document,signature'],
            'caption' => ['nullable', 'string', 'max:500'],
            'task_report_id' => ['nullable', 'exists:task_reports,id'],
        ]);

        $stored = [];

        foreach ($request->file('files') as $file) {
            $path = $file->store("tasks/{$task->id}", 'public');

            $stored[] = TaskAttachment::create([
                'task_id' => $task->id,
                'task_report_id' => $request->integer('task_report_id') ?: null,
                'user_id' => $user->id,
                'kind' => $request->string('kind')->toString(),
                'path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'caption' => $request->string('caption')->toString() ?: null,
            ]);
        }

        return response()->json(
            TaskAttachmentResource::collection(collect($stored)),
            201,
        );
    }

    public function destroy(Request $request, Task $task, TaskAttachment $attachment): JsonResponse
    {
        abort_if($attachment->task_id !== $task->id, 404);

        $user = $request->user();

        // A technician may only remove what they uploaded themselves.
        abort_if(
            $user->isTechnician() && $attachment->user_id !== $user->id,
            403,
            'لا يمكنك حذف مرفق لم ترفعه.',
        );

        Storage::disk('public')->delete($attachment->path);
        $attachment->delete();

        return response()->json(['message' => 'تم حذف المرفق.']);
    }
}
