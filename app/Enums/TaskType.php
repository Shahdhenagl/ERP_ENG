<?php

namespace App\Enums;

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
            self::Installation => 'تركيب',
            self::Maintenance => 'صيانة',
            self::Repair => 'إصلاح عطل',
            self::Inspection => 'معاينة',
            self::Delivery => 'تسليم',
        };
    }
}
