<?php

namespace App\Enums;

/**
 * What an operator set. Whether a sent quote has lapsed is a fact about
 * today's date and is derived — see Quotation::effectiveStatus().
 */
enum QuotationStatus: string
{
    case Draft = 'draft';
    case Sent = 'sent';
    case Accepted = 'accepted';
    case Rejected = 'rejected';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'مسودة',
            self::Sent => 'مُرسَل',
            self::Accepted => 'مقبول',
            self::Rejected => 'مرفوض',
            self::Cancelled => 'ملغي',
        };
    }

    /** Nothing more happens to a quote once the customer has decided. */
    public function isFinal(): bool
    {
        return in_array($this, [self::Accepted, self::Rejected, self::Cancelled], true);
    }
}
