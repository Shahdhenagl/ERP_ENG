<?php

namespace App\Enums;

use App\Support\Terms;

enum ItemCategory: string
{
    case Ups = 'ups';
    case Battery = 'battery';
    case SparePart = 'spare_part';
    case Consumable = 'consumable';

    public function label(): string
    {
        return match ($this) {
            self::Ups => Terms::get('أجهزة UPS'),
            self::Battery => Terms::get('بطاريات'),
            self::SparePart => Terms::get('قطع غيار'),
            self::Consumable => Terms::get('مستهلكات'),
        };
    }

    /** Whether this kind of item carries a technical nameplate the form collects. */
    public function hasSpecs(): bool
    {
        return in_array($this, [self::Ups, self::Battery], true);
    }
}
