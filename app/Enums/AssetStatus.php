<?php

namespace App\Enums;

use App\Support\Terms;

enum AssetStatus: string
{
    case Active = 'active';
    case UnderRepair = 'under_repair';
    case Retired = 'retired';

    public function label(): string
    {
        return match ($this) {
            self::Active => Terms::get('في الخدمة'),
            self::UnderRepair => Terms::get('تحت الإصلاح'),
            self::Retired => Terms::get('خارج الخدمة'),
        };
    }
}
