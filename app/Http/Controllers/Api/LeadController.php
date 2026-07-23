<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Lead;
use App\Services\LeadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    public function __construct(protected LeadService $leads) {}

    public function index(Request $request): JsonResponse
    {
        $leads = Lead::query()
            ->search($request->string('search')->toString())
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('open'), fn ($q) => $q->open())
            ->when($request->integer('owner_id'), fn ($q, $id) => $q->where('owner_id', $id))
            ->with(['owner', 'customer'])
            ->withCount(['followUps as open_follow_ups_count' => fn ($q) => $q->open()])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return response()->json([
            'data' => $leads->through(fn (Lead $l) => $this->present($l))->items(),
            'meta' => [
                'total' => $leads->total(),
                'last_page' => $leads->lastPage(),
                // The pipeline at a glance — one count per open stage.
                'pipeline' => Lead::query()
                    ->open()
                    ->selectRaw('status, count(*) as n')
                    ->groupBy('status')
                    ->pluck('n', 'status'),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()->id;

        $lead = Lead::create($data);

        ActivityLog::record('lead.created', $lead, "عميل محتمل {$lead->code} — {$lead->name}");

        return response()->json(['data' => $this->present($lead->load(['owner', 'customer']))], 201);
    }

    public function show(Lead $lead): JsonResponse
    {
        return response()->json([
            'data' => $this->present(
                $lead->load(['owner', 'customer', 'followUps.owner']),
                withFollowUps: true,
            ),
        ]);
    }

    public function update(Request $request, Lead $lead): JsonResponse
    {
        $lead->update($this->validated($request));

        ActivityLog::record('lead.updated', $lead, "تعديل عميل محتمل {$lead->code}");

        return response()->json(['data' => $this->present($lead->fresh(['owner', 'customer']))]);
    }

    /** Move it along the pipeline — winning it mints a customer. */
    public function status(Request $request, Lead $lead): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:new,contacted,qualified,won,lost'],
            'lost_reason' => ['nullable', 'string', 'max:255'],
        ]);

        $updated = $this->leads->changeStatus(
            $lead,
            $data['status'],
            $request->user(),
            $data['lost_reason'] ?? null,
        );

        ActivityLog::record(
            'lead.status',
            $updated,
            "عميل محتمل {$updated->code}: {$updated->statusLabel()}",
        );

        return response()->json([
            'data' => $this->present($updated),
            // So the UI can jump straight to the customer it just created.
            'customer_id' => $updated->customer_id,
        ]);
    }

    public function destroy(Lead $lead): JsonResponse
    {
        $code = $lead->code;
        $lead->delete();

        ActivityLog::record('lead.deleted', $lead, "حذف عميل محتمل {$code}");

        return response()->json(['message' => 'تم حذف العميل المحتمل.']);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'company' => ['nullable', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:32'],
            'whatsapp' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:160'],
            'source' => ['nullable', 'in:referral,call,walk_in,social,website,other'],
            'est_value' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'owner_id' => ['nullable', 'exists:users,id'],
        ]);
    }

    /** @return array<string, mixed> */
    protected function present(Lead $lead, bool $withFollowUps = false): array
    {
        $data = [
            'id' => $lead->id,
            'code' => $lead->code,
            'name' => $lead->name,
            'company' => $lead->company,
            'phone' => $lead->phone,
            'whatsapp' => $lead->whatsapp,
            'whatsapp_number' => $lead->whatsappNumber(),
            'email' => $lead->email,

            'source' => $lead->source,
            'source_label' => $lead->sourceLabel(),
            'status' => $lead->status,
            'status_label' => $lead->statusLabel(),
            'est_value' => $lead->est_value,
            'notes' => $lead->notes,
            'lost_reason' => $lead->lost_reason,

            'owner' => $lead->owner?->name,
            'owner_id' => $lead->owner_id,
            'customer_id' => $lead->customer_id,
            'open_follow_ups' => $lead->open_follow_ups_count ?? null,

            'created_at' => $lead->created_at?->toIso8601String(),
        ];

        if ($withFollowUps) {
            $data['follow_ups'] = $lead->followUps
                ->sortBy('due_at')
                ->map(fn ($f) => [
                    'id' => $f->id,
                    'type' => $f->type,
                    'type_label' => $f->typeLabel(),
                    'due_at' => $f->due_at?->toIso8601String(),
                    'done_at' => $f->done_at?->toIso8601String(),
                    'status' => $f->status(),
                    'status_label' => $f->statusLabel(),
                    'note' => $f->note,
                    'outcome' => $f->outcome,
                    'owner' => $f->owner?->name,
                ])
                ->values();
        }

        return $data;
    }
}
