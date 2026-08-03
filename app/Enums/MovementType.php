<?php

namespace App\Enums;

use App\Support\Terms;

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
            self::Receipt => Terms::get('وارد'),
            self::Transfer => Terms::get('تحويل'),
            self::Issue => Terms::get('صرف على مهمة'),
            self::Return => Terms::get('مرتجع من مهمة'),
            self::Adjustment => Terms::get('تسوية جرد'),
            self::PurchaseReturn => Terms::get('مرتجع مشتريات'),
            self::SalesReturn => Terms::get('مرتجع مبيعات'),
            self::Sale => Terms::get('بيع بفاتورة'),
            self::SaleVoid => Terms::get('إلغاء فاتورة بيع'),
        };
    }

    /** Only a purchase changes what the stock cost the company. */
    public function movesCost(): bool
    {
        return $this === self::Receipt;
    }
}
