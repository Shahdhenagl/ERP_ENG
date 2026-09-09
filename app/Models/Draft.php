<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Draft extends Model
{
    use HasFactory;

    protected $fillable = [
        'draft_category_id', 'title', 'title_en', 'content', 'content_en',
        'font_size', 'font_family', 'text_color', 'accent_color', 'direction',
        'created_by', 'updated_by',
    ];

    protected $casts = ['font_size' => 'float'];

    public function category(): BelongsTo
    {
        return $this->belongsTo(DraftCategory::class, 'draft_category_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
