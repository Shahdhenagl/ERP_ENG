<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A reusable item on the recurring-expense checklist, such as rent, internet,
 * or a software licence. An item can be checked against more than one bill.
 */
class RecurringExpenseItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'label',
        'created_by',
    ];

    public function expenses(): BelongsToMany
    {
        return $this->belongsToMany(RecurringExpense::class, 'recurring_expense_item_links')
            ->withTimestamps();
    }
}
