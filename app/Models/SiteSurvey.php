<?php

namespace App\Models;

use App\Enums\SurveyStatus;
use App\Models\Concerns\HasAttachments;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One site visit, and what it measured.
 *
 * The load, phases and autonomy here are what a quotation is sized against;
 * approving the survey freezes them as the basis it answers to.
 */
class SiteSurvey extends Model
{
    use HasAttachments, HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'lead_id', 'customer_id', 'branch_id',
        'surveyed_by', 'survey_date', 'status',
        'contact_name', 'contact_phone', 'address', 'city',
        'load_kva', 'phase', 'backup_minutes',
        'existing_equipment', 'recommendation', 'notes',
        'approved_by', 'approved_at', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'survey_date' => 'date',
            'status' => SurveyStatus::class,
            'load_kva' => 'decimal:2',
            'backup_minutes' => 'integer',
            'approved_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $survey) {
            $survey->code ??= static::nextCode();
            $survey->survey_date ??= now()->toDateString();
            $survey->status ??= SurveyStatus::Draft;
        });
    }

    /** Sequential per-year: SV-2026-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return sprintf('SV-%d-%04d', now()->year, $last + 1);
    }

    // ── Relations ────────────────────────────────────────────

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function surveyor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'surveyed_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Presentation ─────────────────────────────────────────

    public function statusLabel(): string
    {
        return $this->status->label();
    }

    public function phaseLabel(): ?string
    {
        return match ($this->phase) {
            'single' => 'أحادي',
            'three' => 'ثلاثي',
            default => null,
        };
    }

    public function scopeStatus(Builder $query, ?string $status): Builder
    {
        return $status ? $query->where('status', $status) : $query;
    }
}
