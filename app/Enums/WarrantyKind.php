<?php

namespace App\Enums;

use App\Support\Terms;

/** Who honours the cover — which decides whether a repair costs us anything. */
enum WarrantyKind: string
{
    case Company = 'company';
    case Supplier = 'supplier';
    case Extension = 'extension';

    public function label(): string
    {
        return match ($this) {
            self::Company => Terms::get('ضمان الشركة'),
            self::Supplier => Terms::get('ضمان المورّد'),
            self::Extension => Terms::get('تمديد ضمان'),
        };
    }
}
