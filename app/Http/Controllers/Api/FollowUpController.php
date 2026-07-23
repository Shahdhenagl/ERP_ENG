<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\FollowUp;
use App\Models\Lead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FollowUpController extends Controller
{
    /** The two things a follow-up can hang off, by the short name the API speaks. */
    private const SUBJECTS = [
        'lead' => Lead::class,
        'customer' => Customer::class,
    ];

    public function index(Request $request): JsonResponse
    {
        $followUps = FollowUp::query()
            ->when($request->boolean('open'), fn ($q) => $q->open())
            ->when($request->boolean('due'), fn ($q) => $q->due())
            ->when($request->integer('owner_id'), fn ($q, $id) => $q->where('owner_id', $id))
            ->when(
                $request->filled('subject_type') && $request->filled('subject_id'),
                fn ($q) => $q
                    ->where('subject_type', self::SUBJECTS[$request->string('subject_type')->toString()] ?? '')
                    ->where('subject_id', $request->integer('subject_id')),
            )
            ->with(['subject', 'owner'])
            ->orderBy('due_at')
            ->paginate($request->integer('per_page', 40));

        return response()->json([
            'data' => $followUps->through(fn (FollowUp $f) => $this->present($f))->items(),
            'meta' => [
                'total' => $followUps->total(),
                'last_page' => $followUps->lastPage(),
                'overdue' => FollowUp::query()->due()->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject_type' => ['required', Rule::in(array_keys(self::SUBJECTS))],
            'subject_id' => ['required', 'integer'],
            'type' => ['required', 'in:call,visit,whatsapp,email,note'],
            'due_at' => ['required', 'date'],
            'note' => ['nullable', 'string', 'max:1000'],
            'owner_id' => ['nullable', 'exists:users,id'],
        ]);

        $subjectClass = self::SUBJECTS[$data['subject_type']];
        $subject = $subjectClass::findOrFail($data['subject_id']);

        $followUp = $subject->followUps()->create([
            'type' => $data['type'],
            'due_at' => $data['due_at'],
            'note' => $data['note'] ?? null,
            'owner_id' => $data['owner_id'] ?? null,
            'created_by' => $request->user()->id,
        ]);

        ActivityLog::record('followup.created', $followUp, "متابعة {$followUp->typeLabel()} — {$subject->name}");

        return response()->json(['data' => $this->present($followUp->load(['subject', 'owner']))], 201);
    }

    public function update(Request $request, FollowUp $followUp): JsonResponse
    {
        $data = $request->validate([
            'type' => ['sometimes', 'in:call,visit,whatsapp,email,note'],
            'due_at' => ['sometimes', 'date'],
            'note' => ['nullable', 'string', 'max:1000'],
            'owner_id' => ['nullable', 'exists:users,id'],
        ]);

        $followUp->update($data);

        return response()->json(['data' => $this->present($followUp->fresh(['subject', 'owner']))]);
    }

    /** Mark it done — with what came of it. */
    public function complete(Request $request, FollowUp $followUp): JsonResponse
    {
        $data = $request->validate([
            'outcome' => ['nullable', 'string', 'max:1000'],
        ]);

        $followUp->forceFill([
            'done_at' => now(),
            'outcome' => $data['outcome'] ?? null,
        ])->save();

        ActivityLog::record('followup.completed', $followUp, "إتمام متابعة {$followUp->subjectName()}");

        return response()->json(['data' => $this->present($followUp->fresh(['subject', 'owner']))]);
    }

    public function destroy(FollowUp $followUp): JsonResponse
    {
        $followUp->delete();

        return response()->json(['message' => 'تم حذف المتابعة.']);
    }

    /** @return array<string, mixed> */
    protected function present(FollowUp $followUp): array
    {
        // Which kind of subject, in the short name the UI links with.
        $subjectType = array_search($followUp->subject_type, self::SUBJECTS, true) ?: null;

        return [
            'id' => $followUp->id,
            'type' => $followUp->type,
            'type_label' => $followUp->typeLabel(),
            'due_at' => $followUp->due_at?->toIso8601String(),
            'done_at' => $followUp->done_at?->toIso8601String(),
            'status' => $followUp->status(),
            'status_label' => $followUp->statusLabel(),
            'note' => $followUp->note,
            'outcome' => $followUp->outcome,

            'subject_type' => $subjectType,
            'subject_id' => $followUp->subject_id,
            'subject' => $followUp->subjectName(),
            'subject_code' => $followUp->subject?->code,

            'owner' => $followUp->owner?->name,
            'owner_id' => $followUp->owner_id,

            'created_at' => $followUp->created_at?->toIso8601String(),
        ];
    }
}
