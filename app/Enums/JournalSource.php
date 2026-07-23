<?php

namespace App\Enums;

enum JournalSource: string
{
    case Manual = 'manual';
    case Invoice = 'invoice';
    case Payment = 'payment';
    case Expense = 'expense';
    case Transfer = 'transfer';
    case SalesReturn = 'sales_return';
    case SupplierInvoice = 'supplier_invoice';
    case SupplierPayment = 'supplier_payment';
    case Custody = 'custody';
    case Stock = 'stock';
    case Opening = 'opening';
    case Payroll = 'payroll';

    public function label(): string
    {
        return match ($this) {
            self::Manual => 'قيد يدوي',
            self::Invoice => 'فاتورة مبيعات',
            self::Payment => 'سند قبض',
            self::Expense => 'مصروف',
            self::Transfer => 'تحويل بين الخزائن',
            self::SalesReturn => 'مرتجع مبيعات',
            self::SupplierInvoice => 'فاتورة مورّد',
            self::SupplierPayment => 'سند صرف لمورد',
            self::Custody => 'عهدة موظف',
            self::Stock => 'حركة مخزون',
            self::Opening => 'رصيد افتتاحي',
            self::Payroll => 'مسير رواتب',
        };
    }

    /**
     * Only a hand-written entry may be edited or deleted. Everything else is a
     * consequence of a document, and is corrected by correcting the document.
     */
    public function isManual(): bool
    {
        return $this === self::Manual;
    }
}
