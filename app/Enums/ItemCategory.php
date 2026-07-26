<?php

namespace App\Enums;

enum ItemCategory: string
{
    case Ups = 'ups';
    case Battery = 'battery';
    case SparePart = 'spare_part';
    case Consumable = 'consumable';

    public function label(): string
    {
        return match ($this) {
            self::Ups => 'أجهزة UPS',
            self::Battery => 'بطاريات',
            self::SparePart => 'قطع غيار',
            self::Consumable => 'مستهلكات',
        };
    }

    /** Whether this kind of item carries a technical nameplate the form collects. */
    public function hasSpecs(): bool
    {
        return in_array($this, [self::Ups, self::Battery], true);
    }
}
