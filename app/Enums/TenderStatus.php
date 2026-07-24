<?php

namespace App\Enums;

enum TenderStatus: string
{
    case Registered = 'registered';
    case Submitted = 'submitted';
    case Won = 'won';
    case Lost = 'lost';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Registered => 'مسجّلة',
            self::Submitted => 'مقدَّمة',
            self::Won => 'فائزة',
            self::Lost => 'خاسرة',
            self::Cancelled => 'ملغاة',
        };
    }

    /** Decided one way or the other — it counts in the win rate. */
    public function isSettled(): bool
    {
        return in_array($this, [self::Won, self::Lost], true);
    }

    public function isOpen(): bool
    {
        return in_array($this, [self::Registered, self::Submitted], true);
    }
}
