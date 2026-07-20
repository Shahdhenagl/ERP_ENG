<?php

namespace App\Enums;

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
            self::Draft => 'مسودة',
            self::Issued => 'صادرة',
            self::Void => 'ملغاة',
        };
    }

    /** A draft is still being written; a void one never counted. */
    public function countsAsReceivable(): bool
    {
        return $this === self::Issued;
    }
}
