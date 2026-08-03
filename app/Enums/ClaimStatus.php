<?php

namespace App\Enums;

use App\Support\Terms;

enum ClaimStatus: string
{
    case Open = 'open';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Repaired = 'repaired';
    case Replaced = 'replaced';
    case Closed = 'closed';

    public function label(): string
    {
        return match ($this) {
            self::Open => Terms::get('تحت الفحص'),
            self::Approved => Terms::get('معتمدة'),
            self::Rejected => Terms::get('مرفوضة'),
            self::Repaired => Terms::get('تم الإصلاح'),
            self::Replaced => Terms::get('تم الاستبدال'),
            self::Closed => Terms::get('مغلقة'),
        };
    }

    /** Nothing more will happen to a claim in one of these. */
    public function isFinal(): bool
    {
        return in_array($this, [self::Rejected, self::Repaired, self::Replaced, self::Closed], true);
    }
}
