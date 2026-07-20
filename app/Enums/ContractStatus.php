<?php

namespace App\Enums;

/**
 * What an operator set, not what the calendar says. Expiry is derived —
 * see Contract::effectiveStatus().
 */
enum ContractStatus: string
{
    case Draft = 'draft';
    case Active = 'active';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'مسودة',
            self::Active => 'ساري',
            self::Cancelled => 'ملغي',
        };
    }
}
