<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\PurchaseReturn */
class PurchaseReturnResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,

            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => $this->supplier?->name),

            'supplier_invoice_id' => $this->supplier_invoice_id,
            'supplier_invoice_code' => $this->whenLoaded('invoice', fn () => $this->invoice?->code),

            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => $this->warehouse?->name),

            'return_date' => $this->return_date?->toDateString(),
            'reason' => $this->reason,
            'status' => $this->status,
            'status_label' => $this->status === 'posted' ? 'مُرحّل' : 'مسودة',
            'total' => (float) $this->total,

            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn ($line) => [
                'id' => $line->id,
                'item_id' => $line->item_id,
                'item' => $line->item?->name,
                'unit' => $line->item?->unit,
                'qty' => (float) $line->qty,
                'unit_cost' => (float) $line->unit_cost,
                'line_total' => (float) $line->line_total,
            ])),

            'notes' => $this->notes,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
