<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\SatisfactionSurvey;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SatisfactionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $surveys = SatisfactionSurvey::query()
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->integer('rating'), fn ($q, $r) => $q->where('rating', $r))
            ->with(['task', 'customer'])
            ->orderByDesc('id')
            ->get()
            ->map(fn (SatisfactionSurvey $survey) => $this->present($survey));

        return response()->json([
            'data' => $surveys,
            'meta' => ['pending' => SatisfactionSurvey::query()->pending()->count()],
        ]);
    }

    /**
     * Open a survey against a closed job. One per job, and only once the work
     * is actually done — there is nothing to rate before then.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'task_id' => ['required', 'exists:tasks,id'],
            'comment' => ['nullable', 'string', 'max:1000'],
            'rating' => ['nullable', 'integer', 'between:1,5'],
        ]);

        $task = Task::findOrFail($data['task_id']);

        if ($task->status !== TaskStatus::Completed) {
            throw ValidationException::withMessages([
                'task_id' => 'لا يُقيَّم إلا أمر عمل منتهٍ.',
            ]);
        }

        if (SatisfactionSurvey::where('task_id', $task->id)->exists()) {
            throw ValidationException::withMessages([
                'task_id' => 'تم إنشاء استطلاع لأمر العمل هذا بالفعل.',
            ]);
        }

        $responded = isset($data['rating']);

        $survey = SatisfactionSurvey::create([
            'task_id' => $task->id,
            'customer_id' => $task->customer_id,
            'status' => $responded ? 'responded' : 'pending',
            'rating' => $data['rating'] ?? null,
            'comment' => $data['comment'] ?? null,
            'sent_at' => now(),
            'responded_at' => $responded ? now() : null,
            'created_by' => $request->user()->id,
        ]);

        ActivityLog::record('csat.created', $survey, "استطلاع رضا لأمر العمل {$task->code}");

        return response()->json(['data' => $this->present($survey->load(['task', 'customer']))], 201);
    }

    /** Record the customer's answer. */
    public function respond(Request $request, SatisfactionSurvey $satisfactionSurvey): JsonResponse
    {
        $data = $request->validate([
            'rating' => ['required', 'integer', 'between:1,5'],
            'comment' => ['nullable', 'string', 'max:1000'],
        ]);

        $satisfactionSurvey->update([
            'rating' => $data['rating'],
            'comment' => $data['comment'] ?? $satisfactionSurvey->comment,
            'status' => 'responded',
            'responded_at' => now(),
        ]);

        return response()->json(['data' => $this->present($satisfactionSurvey->fresh()->load(['task', 'customer']))]);
    }

    /**
     * The headline: how many answered, the average score, and where the scores
     * fell — plus the response rate, since an average off two replies is noise.
     */
    public function summary(): JsonResponse
    {
        $responded = SatisfactionSurvey::query()->responded();
        $count = (clone $responded)->count();
        $total = SatisfactionSurvey::query()->count();

        $distribution = [];
        for ($star = 1; $star <= 5; $star++) {
            $distribution[$star] = (clone $responded)->where('rating', $star)->count();
        }

        return response()->json([
            'responses' => $count,
            'pending' => SatisfactionSurvey::query()->pending()->count(),
            'average' => $count ? round((float) (clone $responded)->avg('rating'), 2) : null,
            'response_rate' => $total ? round($count / $total * 100, 1) : null,
            'distribution' => $distribution,
        ]);
    }

    /** Closed jobs with no survey yet — the ones worth opening one for. */
    public function candidates(): JsonResponse
    {
        $tasks = Task::query()
            ->where('status', TaskStatus::Completed->value)
            ->whereDoesntHave('satisfactionSurvey')
            ->with('customer')
            ->orderByDesc('completed_at')
            ->limit(100)
            ->get()
            ->map(fn (Task $task) => [
                'id' => $task->id,
                'code' => $task->code,
                'title' => $task->title,
                'customer' => $task->customer?->name,
                'completed_at' => $task->completed_at?->toDateString(),
            ]);

        return response()->json(['data' => $tasks]);
    }

    /** @return array<string, mixed> */
    protected function present(SatisfactionSurvey $survey): array
    {
        return [
            'id' => $survey->id,
            'task_id' => $survey->task_id,
            'task_code' => $survey->task?->code,
            'task_title' => $survey->task?->title,
            'customer_id' => $survey->customer_id,
            'customer' => $survey->customer?->name,

            'status' => $survey->status,
            'status_label' => $survey->statusLabel(),
            'rating' => $survey->rating,
            'comment' => $survey->comment,

            'sent_at' => $survey->sent_at?->toIso8601String(),
            'responded_at' => $survey->responded_at?->toIso8601String(),
            'created_at' => $survey->created_at?->toIso8601String(),
        ];
    }
}
