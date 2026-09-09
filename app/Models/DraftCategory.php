<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DraftCategory extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'name_en', 'is_active', 'sort_order'];

    protected $casts = ['is_active' => 'boolean', 'sort_order' => 'integer'];

    public function drafts(): HasMany
    {
        return $this->hasMany(Draft::class);
    }
}
