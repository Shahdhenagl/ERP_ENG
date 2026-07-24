<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierQuoteLine extends Model
{
    use HasFactory;

    protected $fillable = ['supplier_quote_id', 'item_id', 'description', 'qty', 'unit_price', 'sort'];

    protected function casts(): array
    {
        return ['qty' => 'decimal:3', 'unit_price' => 'decimal:2'];
    }

    public function quote(): BelongsTo
    {
        return $this->belongsTo(SupplierQuote::class, 'supplier_quote_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function lineTotal(): float
    {
        return round((float) $this->qty * (float) $this->unit_price, 2);
    }
}
