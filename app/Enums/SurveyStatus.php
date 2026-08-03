<?php

namespace App\Enums;

use App\Support\Terms;

enum SurveyStatus: string
{
    case Draft = 'draft';
    case Completed = 'completed';
    case Approved = 'approved';

    public function label(): string
    {
        return match ($this) {
            self::Draft => Terms::get('مسودة'),
            self::Completed => Terms::get('مكتملة'),
            self::Approved => Terms::get('معتمدة'),
        };
    }

    /** Locked once approved — an approved survey is the basis of a quote. */
    public function isLocked(): bool
    {
        return $this === self::Approved;
    }
}
