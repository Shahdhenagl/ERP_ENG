<?php

namespace App\Enums;

use App\Support\Terms;

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
            self::Draft => Terms::get('مسودة'),
            self::Active => Terms::get('ساري'),
            self::Cancelled => Terms::get('ملغي'),
        };
    }
}
