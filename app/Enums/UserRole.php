<?php

namespace App\Enums;

enum UserRole: string
{
    case Admin = 'admin';
    case Manager = 'manager';
    case Technician = 'technician';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'مدير النظام',
            self::Manager => 'مدير',
            self::Technician => 'فني',
        };
    }

    /** Admins and managers both dispatch work; only admins manage users. */
    public function canDispatch(): bool
    {
        return in_array($this, [self::Admin, self::Manager], true);
    }

    public function canManageUsers(): bool
    {
        return $this === self::Admin;
    }
}
