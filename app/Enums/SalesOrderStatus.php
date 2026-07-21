<?php

namespace App\Enums;

enum SalesOrderStatus: string
{
    case Open = 'open';
    case Delivered = 'delivered';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Open => 'قيد التنفيذ',
            self::Delivered => 'تم التسليم',
            self::Cancelled => 'ملغي',
        };
    }
}
