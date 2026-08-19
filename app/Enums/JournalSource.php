<?php

namespace App\Enums;

use App\Support\Terms;

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
            self::Manual => Terms::get('قيد يدوي'),
            self::Invoice => Terms::get('فاتورة مبيعات'),
            self::Payment => Terms::get('سند قبض'),
            self::Expense => Terms::get('سند صرف'),
            self::Transfer => Terms::get('تحويل بين الخزائن'),
            self::SalesReturn => Terms::get('مرتجع مبيعات'),
            self::SupplierInvoice => Terms::get('فاتورة مورّد'),
            self::SupplierPayment => Terms::get('سند صرف لمورد'),
            self::Custody => Terms::get('عهدة موظف'),
            self::Stock => Terms::get('حركة مخزون'),
            self::Opening => Terms::get('رصيد افتتاحي'),
            self::Payroll => Terms::get('مسير رواتب'),
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
