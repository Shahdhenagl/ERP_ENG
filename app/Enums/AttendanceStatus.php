<?php

namespace App\Enums;

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
            self::Present => 'حاضر',
            self::Late => 'متأخر',
            self::Absent => 'غائب',
            self::Leave => 'إجازة',
            self::Holiday => 'عطلة',
        };
    }

    /** The day counts as attended — the person was on site and working. */
    public function isAttended(): bool
    {
        return in_array($this, [self::Present, self::Late], true);
    }
}
