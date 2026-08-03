<?php

namespace App\Http\Controllers\Api;

use App\Enums\TenderStatus;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Tender;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class TenderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenders = Tender::query()
            ->status($request->string('status')->toString() ?: null)
            ->search($request->string('search')->toString())
            ->with(['customer', 'owner'])
            ->orderByRaw('submission_deadline is null, submission_deadline asc')
            ->orderByDesc('id')
            ->get()
            ->map(fn (Tender $tender) => $this->present($tender));

        $won = Tender::query()->where('status', TenderStatus::Won->value)->count();
        $lost = Tender::query()->where('status', TenderStatus::Lost->value)->count();

        return response()->json([
            'data' => $tenders,
            'meta' => [
                'open' => Tender::query()->whereIn('status', ['registered', 'submitted'])->count(),
                'won' => $won,
                'lost' => $lost,
                'win_rate' => ($won + $lost) ? round($won / ($won + $lost) * 100, 1) : null,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tender = Tender::create([
            ...$this->validated($request),
            'created_by' => $request->user()->id,
        ]);

        ActivityLog::record('tender.created', $tender, "مناقصة {$tender->code}");

        return response()->json(['data' => $this->present($tender->load(['customer', 'owner']))], 201);
    }

    public function show(Tender $tender): JsonResponse
    {
        return response()->json(['data' => $this->present($tender->load(['customer', 'owner']))]);
    }

    public function update(Request $request, Tender $tender): JsonResponse
    {
        $tender->update($this->validated($request));

        return response()->json(['data' => $this->present($tender->fresh()->load(['customer', 'owner']))]);
    }

    /** Mark the bid as submitted — past the deadline it can only be settled. */
    public function submit(Tender $tender): JsonResponse
    {
        if ($tender->status !== TenderStatus::Registered) {
            throw ValidationException::withMessages(['status' => Terms::get('لا يمكن تقديم إلا مناقصة مسجّلة.')]);
        }

        $tender->update(['status' => TenderStatus::Submitted]);

        return response()->json(['data' => $this->present($tender->fresh()->load(['customer', 'owner']))]);
    }

    /** Settle a bid: won at a price, or lost with a reason. */
    public function decide(Request $request, Tender $tender): JsonResponse
    {
        $data = $request->validate([
            'result' => ['required', 'in:won,lost'],
            'awarded_value' => ['nullable', 'numeric', 'min:0'],
            'result_note' => ['nullable', 'string', 'max:500'],
            'decided_on' => ['nullable', 'date'],
        ]);

        if (! $tender->status->isOpen()) {
            throw ValidationException::withMessages(['status' => Terms::get('المناقصة محسومة بالفعل.')]);
        }

        $tender->update([
            'status' => $data['result'] === 'won' ? TenderStatus::Won : TenderStatus::Lost,
            'awarded_value' => $data['result'] === 'won' ? ($data['awarded_value'] ?? null) : null,
            'result_note' => $data['result_note'] ?? null,
            'decided_on' => $data['decided_on'] ?? now()->toDateString(),
        ]);

        ActivityLog::record(
            "tender.{$data['result']}",
            $tender,
            "مناقصة {$tender->code}: {$tender->statusLabel()}",
        );

        return response()->json(['data' => $this->present($tender->fresh()->load(['customer', 'owner']))]);
    }

    /** @return array<string, mixed> */
    protected function present(Tender $tender): array
    {
        return [
            'id' => $tender->id,
            'code' => $tender->code,
            'reference_no' => $tender->reference_no,
            'entity' => $tender->entity,
            'title' => $tender->title,

            'customer_id' => $tender->customer_id,
            'customer' => $tender->customer?->name,

            'announced_on' => $tender->announced_on?->toDateString(),
            'submission_deadline' => $tender->submission_deadline?->toDateString(),
            'opening_date' => $tender->opening_date?->toDateString(),
            'days_to_deadline' => $tender->daysToDeadline(),

            'estimated_value' => $tender->estimated_value !== null ? (float) $tender->estimated_value : null,
            'bid_bond' => $tender->bid_bond !== null ? (float) $tender->bid_bond : null,

            'status' => $tender->status->value,
            'status_label' => $tender->statusLabel(),

            'awarded_value' => $tender->awarded_value !== null ? (float) $tender->awarded_value : null,
            'result_note' => $tender->result_note,
            'decided_on' => $tender->decided_on?->toDateString(),

            'owner_id' => $tender->owner_id,
            'owner' => $tender->owner?->name,
            'description' => $tender->description,
            'notes' => $tender->notes,

            'created_at' => $tender->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'reference_no' => ['nullable', 'string', 'max:120'],
            'entity' => ['required', 'string', 'max:200'],
            'title' => ['required', 'string', 'max:300'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'announced_on' => ['nullable', 'date'],
            'submission_deadline' => ['nullable', 'date'],
            'opening_date' => ['nullable', 'date'],
            'estimated_value' => ['nullable', 'numeric', 'min:0'],
            'bid_bond' => ['nullable', 'numeric', 'min:0'],
            'owner_id' => ['nullable', 'exists:users,id'],
            'description' => ['nullable', 'string', 'max:2000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
    }
}
