<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseRequestLine extends Model
{
    use HasFactory;

    protected $fillable = [
        'purchase_request_id', 'item_id', 'description', 'qty', 'unit', 'note', 'sort',
    ];

    protected function casts(): array
    {
        return ['qty' => 'decimal:3'];
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class, 'purchase_request_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
