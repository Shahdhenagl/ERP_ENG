<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One operational alert already raised, keyed so it is never raised twice. */
class AlertDispatch extends Model
{
    protected $fillable = ['key'];
}
