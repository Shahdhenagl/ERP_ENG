<?php

namespace App\Enums;

use App\Support\Terms;

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
            self::Registered => Terms::get('مسجّلة'),
            self::Submitted => Terms::get('مقدَّمة'),
            self::Won => Terms::get('فائزة'),
            self::Lost => Terms::get('خاسرة'),
            self::Cancelled => Terms::get('ملغاة'),
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
