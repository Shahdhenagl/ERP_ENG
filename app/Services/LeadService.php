<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that moves a lead between its states.
 *
 * Winning a lead is not a status flag — it is the birth of a customer. Doing
 * both in one transaction is what keeps a "won" lead that points at no customer
 * from ever existing. Losing one keeps its reason, because a pipeline you
 * cannot learn from is just a list.
 */
class LeadService
{
    /**
     * Move a lead to a new status. Winning it mints a customer (once); losing
     * it records why. Any other status is just a step along the way.
     */
    public function changeStatus(
        Lead $lead,
        string $status,
        User $actor,
        ?string $lostReason = null,
    ): Lead {
        if ($status === 'won') {
            $this->convert($lead, $actor);

            return $lead->fresh(['owner', 'customer']);
        }

        if ($status === 'lost') {
            if (! $lostReason) {
                throw ValidationException::withMessages([
                    'lost_reason' => 'سبب الخسارة مطلوب.',
                ]);
            }

            $lead->forceFill(['status' => 'lost', 'lost_reason' => $lostReason])->save();

            return $lead->fresh(['owner', 'customer']);
        }

        // A step back into play clears a stale lost reason so it cannot linger.
        $lead->forceFill(['status' => $status, 'lost_reason' => null])->save();

        return $lead->fresh(['owner', 'customer']);
    }

    /**
     * Turn a lead into a customer.
     *
     * Idempotent: a lead already converted keeps the customer it made rather
     * than spawning a second. The contact details come across; the pipeline
     * fields (source, estimate) stay behind on the lead as its history.
     */
    public function convert(Lead $lead, User $actor): Customer
    {
        if ($lead->customer_id) {
            // Already won — make sure the status agrees and hand back the
            // customer it already became.
            if ($lead->status !== 'won') {
                $lead->forceFill(['status' => 'won'])->save();
            }

            return $lead->customer;
        }

        return DB::transaction(function () use ($lead, $actor) {
            $customer = Customer::create([
                'name' => $lead->name,
                'company' => $lead->company,
                'phone' => $lead->phone ?: '—',
                'whatsapp' => $lead->whatsapp,
                'email' => $lead->email,
                'notes' => $lead->notes,
                'created_by' => $actor->id,
            ]);

            $lead->forceFill([
                'status' => 'won',
                'lost_reason' => null,
                'customer_id' => $customer->id,
            ])->save();

            return $customer;
        });
    }
}
