<?php

namespace App\Http\Controllers\Api;

use App\Enums\SurveyStatus;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\SiteSurvey;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SiteSurveyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $surveys = SiteSurvey::query()
            ->status($request->string('status')->toString() ?: null)
            ->when($request->integer('lead_id'), fn ($q, $id) => $q->where('lead_id', $id))
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->with(['lead', 'customer', 'surveyor'])
            ->orderByDesc('survey_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (SiteSurvey $survey) => $this->present($survey));

        return response()->json(['data' => $surveys]);
    }

    public function store(Request $request): JsonResponse
    {
        $survey = SiteSurvey::create([
            ...$this->validated($request),
            'created_by' => $request->user()->id,
        ]);

        ActivityLog::record('site_survey.created', $survey, "معاينة موقع {$survey->code}");

        return response()->json(['data' => $this->present($survey->load(['lead', 'customer', 'surveyor']))], 201);
    }

    public function show(SiteSurvey $siteSurvey): JsonResponse
    {
        return response()->json([
            'data' => $this->present($siteSurvey->load(['lead', 'customer', 'branch', 'surveyor', 'approver'])),
        ]);
    }

    public function update(Request $request, SiteSurvey $siteSurvey): JsonResponse
    {
        if ($siteSurvey->status === SurveyStatus::Approved) {
            throw ValidationException::withMessages([
                'status' => Terms::get('لا يمكن تعديل معاينة معتمدة.'),
            ]);
        }

        $siteSurvey->update($this->validated($request));

        return response()->json(['data' => $this->present($siteSurvey->fresh()->load(['lead', 'customer', 'surveyor']))]);
    }

    /** Remove a survey. An approved one is a quotation's basis and is kept. */
    public function destroy(SiteSurvey $siteSurvey): JsonResponse
    {
        if ($siteSurvey->status === SurveyStatus::Approved) {
            throw ValidationException::withMessages([
                'status' => Terms::get('لا يمكن حذف معاينة معتمدة.'),
            ]);
        }

        $code = $siteSurvey->code;
        $siteSurvey->delete();

        ActivityLog::record('site_survey.deleted', $siteSurvey, "حذف معاينة {$code}");

        return response()->json(['message' => Terms::get('تم حذف المعاينة.')]);
    }

    /** Freeze the survey as the basis a quotation is sized against. */
    public function approve(Request $request, SiteSurvey $siteSurvey): JsonResponse
    {
        if ($siteSurvey->status === SurveyStatus::Approved) {
            throw ValidationException::withMessages(['status' => Terms::get('المعاينة معتمدة بالفعل.')]);
        }

        $siteSurvey->update([
            'status' => SurveyStatus::Approved,
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
        ]);

        ActivityLog::record('site_survey.approved', $siteSurvey, "اعتماد معاينة {$siteSurvey->code}");

        return response()->json(['data' => $this->present($siteSurvey->fresh()->load(['lead', 'customer', 'approver']))]);
    }

    /** @return array<string, mixed> */
    protected function present(SiteSurvey $survey): array
    {
        return [
            'id' => $survey->id,
            'code' => $survey->code,

            'lead_id' => $survey->lead_id,
            'lead_code' => $survey->lead?->code,
            'customer_id' => $survey->customer_id,
            'customer' => $survey->customer?->name,
            'branch_id' => $survey->branch_id,
            'branch' => $survey->branch?->name,

            'surveyed_by' => $survey->surveyed_by,
            'surveyor' => $survey->surveyor?->name,
            'survey_date' => $survey->survey_date?->toDateString(),

            'status' => $survey->status->value,
            'status_label' => $survey->statusLabel(),

            'contact_name' => $survey->contact_name,
            'contact_phone' => $survey->contact_phone,
            'address' => $survey->address,
            'city' => $survey->city,

            'load_kva' => $survey->load_kva !== null ? (float) $survey->load_kva : null,
            'phase' => $survey->phase,
            'phase_label' => $survey->phaseLabel(),
            'backup_minutes' => $survey->backup_minutes,

            'existing_equipment' => $survey->existing_equipment,
            'recommendation' => $survey->recommendation,
            'notes' => $survey->notes,

            'approved_by' => $survey->approved_by,
            'approver' => $survey->approver?->name,
            'approved_at' => $survey->approved_at?->toIso8601String(),

            'created_at' => $survey->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'lead_id' => ['nullable', 'exists:leads,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'surveyed_by' => ['nullable', 'exists:users,id'],
            'survey_date' => ['nullable', 'date'],
            'status' => ['nullable', 'in:draft,completed'],
            'contact_name' => ['nullable', 'string', 'max:160'],
            'contact_phone' => ['nullable', 'string', 'max:32'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:80'],
            'load_kva' => ['nullable', 'numeric', 'min:0'],
            'phase' => ['nullable', 'in:single,three'],
            'backup_minutes' => ['nullable', 'integer', 'min:0', 'max:10080'],
            'existing_equipment' => ['nullable', 'string', 'max:2000'],
            'recommendation' => ['nullable', 'string', 'max:2000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
    }
}
