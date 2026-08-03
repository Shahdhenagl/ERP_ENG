<?php

namespace App\Enums;

use App\Support\Terms;

/**
 * What an operator set. Whether an invoice is paid is worked out from the
 * receipts against it, not stored here — see Invoice::paymentState().
 */
enum InvoiceStatus: string
{
    case Draft = 'draft';
    case Issued = 'issued';
    case Void = 'void';

    public function label(): string
    {
        return match ($this) {
            self::Draft => Terms::get('مسودة'),
            self::Issued => Terms::get('صادرة'),
            self::Void => Terms::get('ملغاة'),
        };
    }

    /** A draft is still being written; a void one never counted. */
    public function countsAsReceivable(): bool
    {
        return $this === self::Issued;
    }
}
