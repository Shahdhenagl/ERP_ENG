<?php

namespace App\Enums;

/** Who honours the cover — which decides whether a repair costs us anything. */
enum WarrantyKind: string
{
    case Company = 'company';
    case Supplier = 'supplier';
    case Extension = 'extension';

    public function label(): string
    {
        return match ($this) {
            self::Company => 'ضمان الشركة',
            self::Supplier => 'ضمان المورّد',
            self::Extension => 'تمديد ضمان',
        };
    }
}
