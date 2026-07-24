<?php

namespace App\Models;

use App\Enums\BatteryStatus;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One battery bank in one unit.
 *
 * The due date is the install date plus the expected life — derived, so a
 * revised life moves it and it can never disagree with a stored copy.
 */
class Battery extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'asset_id', 'customer_id',
        'serial_number', 'brand', 'model', 'capacity_ah', 'voltage', 'count',
        'installed_on', 'life_months', 'warranty_months',
        'status', 'replaced_by_id', 'replaced_on', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'installed_on' => 'date',
            'replaced_on' => 'date',
            'status' => BatteryStatus::class,
            'capacity_ah' => 'decimal:2',
            'voltage' => 'decimal:2',
            'count' => 'integer',
            'life_months' => 'integer',
            'warranty_months' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $battery) {
            $battery->code ??= static::nextCode();
            $battery->installed_on ??= now()->toDateString();
            $battery->status ??= BatteryStatus::Active;

            // Carry the owner down from the unit, so the report reads by account.
            if (! $battery->customer_id && $battery->asset_id) {
                $battery->customer_id = Asset::find($battery->asset_id)?->customer_id;
            }
        });
    }

    /** Sequential: BT-0001. */
    public static function nextCode(): string
    {
        $last = static::withTrashed()->max('id') ?? 0;

        return 'BT-'.str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT);
    }

    // ── Relations ────────────────────────────────────────────

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function replacement(): BelongsTo
    {
        return $this->belongsTo(Battery::class, 'replaced_by_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Life ─────────────────────────────────────────────────

    /** Install date plus the expected life, or null without a life to add. */
    public function dueAt(): ?CarbonInterface
    {
        if (! $this->installed_on || ! $this->life_months) {
            return null;
        }

        return $this->installed_on->copy()->addMonths($this->life_months);
    }

    /** Days until the change is due — negative once overdue. */
    public function daysUntilDue(): ?int
    {
        $due = $this->dueAt();

        return $due ? (int) round(now()->startOfDay()->diffInDays($due->startOfDay(), false)) : null;
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', BatteryStatus::Active->value);
    }

    /**
     * Live banks whose due date falls within the next `$days` — including the
     * ones already overdue, which are the ones that matter most.
     */
    public function scopeDueWithin(Builder $query, int $days): Builder
    {
        $limit = now()->addDays($days)->toDateString();

        return $query->where('status', BatteryStatus::Active->value)
            ->whereNotNull('installed_on')
            ->where('life_months', '>', 0)
            ->whereRaw('DATE_ADD(installed_on, INTERVAL life_months MONTH) <= ?', [$limit]);
    }

    public function statusLabel(): string
    {
        return $this->status->label();
    }
}
