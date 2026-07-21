<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuotationLine extends Model
{
    use HasFactory;

    protected $fillable = [
        'quotation_id', 'item_id', 'description',
        'qty', 'unit_price', 'line_total', 'item_code', 'sort',
    ];

    protected function casts(): array
    {
        return ['qty' => 'decimal:3', 'unit_price' => 'decimal:2', 'line_total' => 'decimal:2'];
    }

    public function quotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
