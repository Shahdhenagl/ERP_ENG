<?php

namespace App\Http\Resources;

use App\Services\WhatsAppLinkBuilder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Customer */
class CustomerResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $whatsapp = app(WhatsAppLinkBuilder::class);

        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'company' => $this->company,
            'phone' => $this->phone,
            'whatsapp' => $this->whatsapp,
            'whatsapp_number' => $this->whatsappNumber(),
            'whatsapp_link' => $whatsapp->link($this->whatsappNumber(), ''),
            'email' => $this->email,
            'address' => $this->address,
            'city' => $this->city,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'map_url' => $this->map_url,
            'maps_url' => $this->mapsUrl(),
            'notes' => $this->notes,
            'is_active' => $this->is_active,
            'tasks_count' => $this->whenCounted('tasks'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
