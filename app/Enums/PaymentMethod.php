<?php

namespace App\Enums;

use App\Support\Terms;

enum PaymentMethod: string
{
    case Cash = 'cash';
    case BankTransfer = 'bank_transfer';
    case InstaPay = 'instapay';
    case VodafoneCash = 'vodafone_cash';
    case Cheque = 'cheque';
    case Wallet = 'wallet';

    public function label(): string
    {
        return match ($this) {
            self::Cash => Terms::get('نقدًا'),
            self::BankTransfer => Terms::get('تحويل بنكي'),
            self::InstaPay => Terms::get('إنستاباي'),
            self::VodafoneCash => Terms::get('فودافون كاش'),
            self::Cheque => Terms::get('شيك'),
            self::Wallet => Terms::get('محفظة إلكترونية'),
        };
    }
}
