<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskPostponement;
use App\Models\User;
use App\Notifications\PostponementRequested;
use App\Notifications\PostponementReviewed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PostponementController extends Controller
{
    /**
     * A technician or manager requests to postpone a task to a new date.
     * Notifies all admins for approval.
     */
    public function request(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'postponed_to' => ['required', 'date', 'after:today'],
            'reason'       => ['required', 'string', 'max:1000'],
        ]);

        // Only the assigned technicians or dispatchers can request a postponement
        $isTechnician = $user->isTechnician();
        $isAssigned   = $task->technicians()->where('users.id', $user->id)->exists();

        if ($isTechnician && ! $isAssigned) {
            abort(403, 'غير مسموح لك بطلب تأجيل هذه المهمة.');
        }

        // Cancel any previous pending request
        $task->postponements()->where('status', 'pending')->update(['status' => 'cancelled']);

        $postponement = $task->postponements()->create([
            'requested_by' => $user->id,
            'postponed_to' => $data['postponed_to'],
            'reason'       => $data['reason'],
            'status'       => 'pending',
        ]);

        $postponement->load('requester');

        // Notify all admins
        User::where('role', UserRole::Admin->value)->get()
            ->each(fn (User $admin) => $admin->notify(new PostponementRequested($task, $postponement)));

        return response()->json([
            'message'      => 'تم إرسال طلب التأجيل بنجاح.',
            'postponement' => $this->format($postponement),
        ]);
    }

    /**
     * Admin approves the postponement request — updates task's scheduled_at.
     */
    public function approve(Request $request, TaskPostponement $postponement): JsonResponse
    {
        abort_unless($postponement->isPending(), 422, 'هذا الطلب تمت مراجعته بالفعل.');

        $postponement->update([
            'status'      => 'approved',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        // Apply the new date to the task
        $postponement->task->update(['scheduled_at' => $postponement->postponed_to]);

        $postponement->load(['requester', 'reviewer', 'task']);

        // Notify the requester
        $postponement->requester->notify(new PostponementReviewed($postponement->task, $postponement));

        return response()->json([
            'message'      => 'تمت الموافقة على طلب التأجيل.',
            'postponement' => $this->format($postponement),
        ]);
    }

    /**
     * Admin rejects the postponement request.
     */
    public function reject(Request $request, TaskPostponement $postponement): JsonResponse
    {
        abort_unless($postponement->isPending(), 422, 'هذا الطلب تمت مراجعته بالفعل.');

        $postponement->update([
            'status'      => 'rejected',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        $postponement->load(['requester', 'reviewer', 'task']);

        // Notify the requester
        $postponement->requester->notify(new PostponementReviewed($postponement->task, $postponement));

        return response()->json([
            'message'      => 'تم رفض طلب التأجيل.',
            'postponement' => $this->format($postponement),
        ]);
    }

    private function format(TaskPostponement $p): array
    {
        return [
            'id'           => $p->id,
            'postponed_to' => $p->postponed_to?->toDateString(),
            'reason'       => $p->reason,
            'status'       => $p->status,
            'requested_by' => $p->requester?->name,
            'reviewed_by'  => $p->reviewer?->name,
            'reviewed_at'  => $p->reviewed_at?->toIso8601String(),
            'created_at'   => $p->created_at?->toIso8601String(),
        ];
    }
}
