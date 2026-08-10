<?php

namespace App\Models;

use App\Enums\TaskStatus;
use App\Enums\VisitStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One promised visit. Lives apart from `tasks` so a year of planning never
 * reaches the dispatcher's queue or the dashboard's counters before it is
 * actionable.
 */
class ContractVisit extends Model
{
    use HasFactory;

    protected $fillable = [
        'contract_id',
        'sequence',
        'planned_for',
        'task_id',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'status' => VisitStatus::class,
            'planned_for' => 'date',
            'sequence' => 'integer',
        ];
    }

    // ── Relations ────────────────────────────────────────────

    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /**
     * Every work order this round cut — one per covered branch. A round with a
     * single site (or none) still has exactly one, so this is the honest count
     * whether the contract fans out or not.
     */
    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    // ── Replanning ───────────────────────────────────────────

    /**
     * Whether a human has committed to this visit. Locked visits survive any
     * change to the contract — a completed visit is history, and a job a
     * technician has already accepted is a promise someone made.
     *
     * A work order that is still pending and unassigned is not a commitment,
     * so it stays free to move.
     */
    public function isLocked(): bool
    {
        if (in_array($this->status, [VisitStatus::Done, VisitStatus::Skipped], true)) {
            return true;
        }

        // A round fans out to one job per branch. It is committed the moment any
        // one of them is accepted or moved off pending — a technician has taken
        // on the round, even if the other branches' orders have not gone out.
        $tasks = $this->relationLoaded('tasks') ? $this->tasks : $this->tasks()->get();

        // Fall back to the single legacy link when no task carries the round id
        // yet (a plan made before the round could fan out).
        if ($tasks->isEmpty() && $this->task) {
            $tasks = collect([$this->task]);
        }

        return $tasks->contains(
            fn (Task $task) => $task->status !== TaskStatus::Pending || $task->technicians->isNotEmpty(),
        );
    }

    public function scopeFree(Builder $query): Builder
    {
        return $query->whereIn('status', [VisitStatus::Planned->value, VisitStatus::Scheduled->value]);
    }

    /** Planned visits close enough to deserve a work order. */
    public function scopeDue(Builder $query, int $horizonDays): Builder
    {
        return $query->where('status', VisitStatus::Planned->value)
            ->whereNull('task_id')
            ->whereDate('planned_for', '<=', now()->addDays($horizonDays)->toDateString());
    }
}
