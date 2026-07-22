<?php

namespace App\Enums;

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
            self::Open => 'تحت الفحص',
            self::Approved => 'معتمدة',
            self::Rejected => 'مرفوضة',
            self::Repaired => 'تم الإصلاح',
            self::Replaced => 'تم الاستبدال',
            self::Closed => 'مغلقة',
        };
    }

    /** Nothing more will happen to a claim in one of these. */
    public function isFinal(): bool
    {
        return in_array($this, [self::Rejected, self::Repaired, self::Replaced, self::Closed], true);
    }
}
