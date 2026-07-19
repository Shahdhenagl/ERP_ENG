<?php

namespace App\Enums;

enum AssetStatus: string
{
    case Active = 'active';
    case UnderRepair = 'under_repair';
    case Retired = 'retired';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'في الخدمة',
            self::UnderRepair => 'تحت الإصلاح',
            self::Retired => 'خارج الخدمة',
        };
    }
}
