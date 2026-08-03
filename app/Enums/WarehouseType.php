<?php

namespace App\Enums;

use App\Support\Terms;

enum WarehouseType: string
{
    case Store = 'store';
    case Van = 'van';

    public function label(): string
    {
        return match ($this) {
            self::Store => Terms::get('مخزن'),
            self::Van => Terms::get('عهدة فني'),
        };
    }
}
