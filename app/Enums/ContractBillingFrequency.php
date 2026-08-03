<?php

namespace App\Enums;

use App\Support\Terms;

enum ContractBillingFrequency: string
{
    case Upfront = 'upfront';
    case Quarterly = 'quarterly';
    case SemiAnnual = 'semi_annual';
    case Annual = 'annual';

    public function label(): string
    {
        return match ($this) {
            self::Upfront => Terms::get('مقدَّم (دفعة واحدة)'),
            self::Quarterly => Terms::get('ربع سنوي'),
            self::SemiAnnual => Terms::get('نصف سنوي'),
            self::Annual => Terms::get('سنوي'),
        };
    }

    /**
     * How many instalments a term of this many years splits into. Upfront is
     * always one; the rest scale the per-year cadence by the term, so a two-year
     * quarterly contract owes eight and a six-month one owes two.
     */
    public function installmentsFor(float $termYears): int
    {
        $perYear = match ($this) {
            self::Upfront => 0,
            self::Annual => 1,
            self::SemiAnnual => 2,
            self::Quarterly => 4,
        };

        if ($perYear === 0) {
            return 1;
        }

        return max(1, (int) round($perYear * $termYears));
    }
}
