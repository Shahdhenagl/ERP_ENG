<?php

namespace App\Enums;

enum WarehouseType: string
{
    case Main = 'main';
    case Van = 'van';

    public function label(): string
    {
        return match ($this) {
            self::Main => 'المخزن الرئيسي',
            self::Van => 'عهدة فني',
        };
    }
}
