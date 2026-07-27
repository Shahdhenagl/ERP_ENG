<?php

namespace App\Enums;

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
            self::Cash => 'نقدًا',
            self::BankTransfer => 'تحويل بنكي',
            self::InstaPay => 'إنستاباي',
            self::VodafoneCash => 'فودافون كاش',
            self::Cheque => 'شيك',
            self::Wallet => 'محفظة إلكترونية',
        };
    }
}
