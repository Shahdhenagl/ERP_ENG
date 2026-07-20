<?php

namespace App\Enums;

/**
 * Where a planned visit stands. `Planned` means it exists on paper only;
 * `Scheduled` means a work order was cut for it.
 */
enum VisitStatus: string
{
    case Planned = 'planned';
    case Scheduled = 'scheduled';
    case Done = 'done';
    case Skipped = 'skipped';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Planned => 'مخططة',
            self::Scheduled => 'صدر أمر شغل',
            self::Done => 'تمت',
            self::Skipped => 'تخطّيت',
            self::Cancelled => 'ملغاة',
        };
    }
}
