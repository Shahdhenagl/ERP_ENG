<?php

namespace App\Enums;

use App\Support\Terms;

enum TaskType: string
{
    case Installation = 'installation';
    case Maintenance = 'maintenance';
    case Repair = 'repair';
    case Inspection = 'inspection';
    case Delivery = 'delivery';

    public function label(): string
    {
        return match ($this) {
            self::Installation => Terms::get('تركيب'),
            self::Maintenance => Terms::get('صيانة'),
            self::Repair => Terms::get('إصلاح عطل'),
            self::Inspection => Terms::get('معاينة'),
            self::Delivery => Terms::get('تسليم'),
        };
    }
}
