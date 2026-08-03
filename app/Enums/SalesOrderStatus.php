<?php

namespace App\Enums;

use App\Support\Terms;

enum SalesOrderStatus: string
{
    case Open = 'open';
    case Delivered = 'delivered';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Open => Terms::get('قيد التنفيذ'),
            self::Delivered => Terms::get('تم التسليم'),
            self::Cancelled => Terms::get('ملغي'),
        };
    }
}
