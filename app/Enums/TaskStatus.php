<?php

namespace App\Enums;

enum TaskStatus: string
{
    case Pending = 'pending';
    case Accepted = 'accepted';
    case OnTheWay = 'on_the_way';
    case InProgress = 'in_progress';
    case Completed = 'completed';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'بانتظار القبول',
            self::Accepted => 'تم القبول',
            self::OnTheWay => 'في الطريق',
            self::InProgress => 'جارٍ العمل',
            self::Completed => 'منتهية',
            self::Cancelled => 'ملغاة',
        };
    }

    /**
     * The state machine. A job may only move along these edges — this is what
     * stops a technician from closing a job they never started.
     *
     * @return array<int, self>
     */
    public function allowedNext(): array
    {
        return match ($this) {
            self::Pending => [self::Accepted, self::Cancelled],
            self::Accepted => [self::OnTheWay, self::InProgress, self::Cancelled],
            self::OnTheWay => [self::InProgress, self::Cancelled],
            self::InProgress => [self::Completed, self::Cancelled],
            self::Completed, self::Cancelled => [],
        };
    }

    public function canTransitionTo(self $next): bool
    {
        return in_array($next, $this->allowedNext(), true);
    }

    public function isTerminal(): bool
    {
        return in_array($this, [self::Completed, self::Cancelled], true);
    }

    /** Timestamp column stamped when the job enters this state. */
    public function timestampColumn(): ?string
    {
        return match ($this) {
            self::Accepted => 'accepted_at',
            self::OnTheWay => 'on_the_way_at',
            self::InProgress => 'started_at',
            self::Completed => 'completed_at',
            self::Cancelled => 'cancelled_at',
            self::Pending => null,
        };
    }
}
