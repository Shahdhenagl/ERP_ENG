<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A day the office is closed. The maintenance planner steps its visits over
 * these the same way it steps over the weekend.
 */
class Holiday extends Model
{
    protected $fillable = ['date', 'name'];

    protected function casts(): array
    {
        return ['date' => 'date'];
    }
}
