<?php

namespace App\Enums;

enum WarehouseType: string
{
    case Store = 'store';
    case Van = 'van';

    public function label(): string
    {
        return match ($this) {
            self::Store => 'مخزن',
            self::Van => 'عهدة فني',
        };
    }
}
