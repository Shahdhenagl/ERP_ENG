<?php

namespace App\Enums;

use App\Support\Terms;

enum BatteryStatus: string
{
    case Active = 'active';
    case Replaced = 'replaced';
    case Faulty = 'faulty';

    public function label(): string
    {
        return match ($this) {
            self::Active => Terms::get('قيد التشغيل'),
            self::Replaced => Terms::get('مُستبدلة'),
            self::Faulty => Terms::get('تالفة'),
        };
    }

    /** Still in service — its replacement clock is still running. */
    public function isLive(): bool
    {
        return $this === self::Active;
    }
}
