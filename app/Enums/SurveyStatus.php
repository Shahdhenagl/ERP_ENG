<?php

namespace App\Enums;

enum SurveyStatus: string
{
    case Draft = 'draft';
    case Completed = 'completed';
    case Approved = 'approved';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'مسودة',
            self::Completed => 'مكتملة',
            self::Approved => 'معتمدة',
        };
    }

    /** Locked once approved — an approved survey is the basis of a quote. */
    public function isLocked(): bool
    {
        return $this === self::Approved;
    }
}
