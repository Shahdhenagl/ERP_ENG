<?php

namespace App\Enums;

use App\Support\Terms;

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
            self::Planned => Terms::get('مخططة'),
            self::Scheduled => Terms::get('صدر أمر شغل'),
            self::Done => Terms::get('تمت'),
            self::Skipped => Terms::get('تخطّيت'),
            self::Cancelled => Terms::get('ملغاة'),
        };
    }
}
