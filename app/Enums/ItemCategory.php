<?php

namespace App\Enums;

enum ItemCategory: string
{
    case Battery = 'battery';
    case SparePart = 'spare_part';
    case Consumable = 'consumable';

    public function label(): string
    {
        return match ($this) {
            self::Battery => 'بطاريات',
            self::SparePart => 'قطع غيار',
            self::Consumable => 'مستهلكات',
        };
    }
}
