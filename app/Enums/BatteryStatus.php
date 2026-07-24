<?php

namespace App\Enums;

enum BatteryStatus: string
{
    case Active = 'active';
    case Replaced = 'replaced';
    case Faulty = 'faulty';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'قيد التشغيل',
            self::Replaced => 'مُستبدلة',
            self::Faulty => 'تالفة',
        };
    }

    /** Still in service — its replacement clock is still running. */
    public function isLive(): bool
    {
        return $this === self::Active;
    }
}
