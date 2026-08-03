<?php

namespace App\Enums;

use App\Support\Terms;

enum AttendanceStatus: string
{
    case Present = 'present';
    case Late = 'late';
    case Absent = 'absent';
    case Leave = 'leave';
    case Holiday = 'holiday';

    public function label(): string
    {
        return match ($this) {
            self::Present => Terms::get('حاضر'),
            self::Late => Terms::get('متأخر'),
            self::Absent => Terms::get('غائب'),
            self::Leave => Terms::get('إجازة'),
            self::Holiday => Terms::get('عطلة'),
        };
    }

    /** The day counts as attended — the person was on site and working. */
    public function isAttended(): bool
    {
        return in_array($this, [self::Present, self::Late], true);
    }
}
