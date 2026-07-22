<?php

namespace App\Enums;

enum AccountType: string
{
    case Asset = 'asset';
    case Liability = 'liability';
    case Equity = 'equity';
    case Revenue = 'revenue';
    case Expense = 'expense';

    public function label(): string
    {
        return match ($this) {
            self::Asset => 'أصول',
            self::Liability => 'خصوم',
            self::Equity => 'حقوق ملكية',
            self::Revenue => 'إيرادات',
            self::Expense => 'مصروفات',
        };
    }

    /**
     * The side an account of this type grows on.
     *
     * Everything downstream reads from this: a balance is debits less credits
     * for the two below, and credits less debits for the rest. Getting it from
     * one place is what stops a report showing revenue as a negative number.
     */
    public function normalBalance(): string
    {
        return match ($this) {
            self::Asset, self::Expense => 'debit',
            default => 'credit',
        };
    }

    /** Assets, liabilities and equity carry forward; the other two do not. */
    public function isBalanceSheet(): bool
    {
        return in_array($this, [self::Asset, self::Liability, self::Equity], true);
    }

    /** The sign to multiply (debit − credit) by to get a readable balance. */
    public function sign(): int
    {
        return $this->normalBalance() === 'debit' ? 1 : -1;
    }
}
