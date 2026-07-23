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
            'type' => $this->type,
            'type_label' => $this->typeLabel(),
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

            // Present only when the list query attached the counts (aliased
            // withCount, so read the attributes directly rather than by relation).
            'contracts_count' => $this->whenCounted('contracts'),
            'active_contracts_count' => $this->when(
                $this->contracts_count !== null,
                fn () => (int) ($this->active_contracts_count ?? 0),
            ),
            'contract_standing' => $this->when(
                $this->contracts_count !== null,
                fn () => $this->contractStanding(),
            ),
            'contract_standing_label' => $this->when(
                $this->contracts_count !== null,
                fn () => $this->contractStandingLabel(),
            ),

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
