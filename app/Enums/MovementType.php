<?php

namespace App\Enums;

enum MovementType: string
{
    case Receipt = 'receipt';
    case Transfer = 'transfer';
    case Issue = 'issue';
    case Return = 'return';
    case Adjustment = 'adjustment';
    case PurchaseReturn = 'purchase_return';

    public function label(): string
    {
        return match ($this) {
            self::Receipt => 'وارد',
            self::Transfer => 'تحويل',
            self::Issue => 'صرف على مهمة',
            self::Return => 'مرتجع من مهمة',
            self::Adjustment => 'تسوية جرد',
            self::PurchaseReturn => 'مرتجع مشتريات',
        };
    }

    /** Only a purchase changes what the stock cost the company. */
    public function movesCost(): bool
    {
        return $this === self::Receipt;
    }
}
