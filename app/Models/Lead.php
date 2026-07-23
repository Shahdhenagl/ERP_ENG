<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A prospect in the pipeline.
 *
 * It carries the same contact fields as a customer, but its state is a status,
 * not a balance. The one rule the model enforces is its own numbering; moving
 * it between states, and turning a won one into a customer, belongs to the
 * service so the two sides of a conversion cannot drift apart.
 */
class Lead extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'name',
        'company',
        'phone',
        'whatsapp',
        'email',
        'source',
        'status',
        'est_value',
        'notes',
        'lost_reason',
        'owner_id',
        'customer_id',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'est_value' => 'float',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $lead) {
            $lead->code ??= static::nextCode();
            $lead->status ??= 'new';
        });
    }

    /** Sequential human-readable code: LD-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return 'LD-'.str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT);
    }

    // ── Relations ────────────────────────────────────────────

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function followUps(): MorphMany
    {
        return $this->morphMany(FollowUp::class, 'subject');
    }

    // ── Helpers ──────────────────────────────────────────────

    public function whatsappNumber(): ?string
    {
        return $this->whatsapp ?: $this->phone;
    }

    public function isOpen(): bool
    {
        return ! in_array($this->status, ['won', 'lost'], true);
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'new' => 'جديد',
            'contacted' => 'تم التواصل',
            'qualified' => 'مؤهَّل',
            'won' => 'مكسوب',
            'lost' => 'خاسر',
            default => $this->status,
        };
    }

    public function sourceLabel(): ?string
    {
        return match ($this->source) {
            'referral' => 'ترشيح',
            'call' => 'اتصال',
            'walk_in' => 'زيارة',
            'social' => 'سوشيال ميديا',
            'website' => 'الموقع',
            'other' => 'أخرى',
            default => $this->source,
        };
    }

    // ── Scopes ───────────────────────────────────────────────

    /** Still in play — not yet won or lost. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNotIn('status', ['won', 'lost']);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('name', 'like', "%{$term}%")
                ->orWhere('company', 'like', "%{$term}%")
                ->orWhere('phone', 'like', "%{$term}%")
                ->orWhere('code', 'like', "%{$term}%");
        });
    }
}
