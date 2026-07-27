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
    case SalesReturn = 'sales_return';
    case Sale = 'sale';
    case SaleVoid = 'sale_void';

    public function label(): string
    {
        return match ($this) {
            self::Receipt => 'وارد',
            self::Transfer => 'تحويل',
            self::Issue => 'صرف على مهمة',
            self::Return => 'مرتجع من مهمة',
            self::Adjustment => 'تسوية جرد',
            self::PurchaseReturn => 'مرتجع مشتريات',
            self::SalesReturn => 'مرتجع مبيعات',
            self::Sale => 'بيع بفاتورة',
            self::SaleVoid => 'إلغاء فاتورة بيع',
        };
    }

    /** Only a purchase changes what the stock cost the company. */
    public function movesCost(): bool
    {
        return $this === self::Receipt;
    }
}
