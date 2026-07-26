<?php

namespace App\Services;

use App\Models\Contract;
use Carbon\CarbonImmutable;

/**
 * Lays a contract's value out as instalments across its visits.
 *
 * The first instalment falls due with activation; the rest are spread evenly, so
 * a quarterly contract of twelve visits has its later payments land on visits
 * three, six and nine. The schedule is re-derivable while the contract is a
 * draft and frozen the moment any money is taken against it — once an instalment
 * is collected the layout is history, exactly like a visit plan that has run.
 */
class ContractPaymentPlanner
{
    public function __construct(protected MaintenancePlanner $planner) {}

    /**
     * (Re)build the schedule from the contract's value, frequency and term.
     *
     * A no-op once anything has been collected, so re-saving a running contract
     * cannot rewrite what a customer has already paid against.
     */
    public function rebuild(Contract $contract): void
    {
        if ($contract->payments()->where('status', 'collected')->exists()) {
            return;
        }

        $contract->payments()->delete();

        $value = (float) $contract->value;

        if ($value <= 0 || ! $contract->starts_on || ! $contract->ends_on) {
            return;
        }

        $count = $contract->billing_frequency->installmentsFor($this->termYears($contract));
        $totalVisits = $this->planner->visitCountFor($contract);
        $interval = $totalVisits / $count;

        $each = round($value / $count, 2);
        $previousVisit = 1;   // the first instalment is taken before visit one

        for ($k = 1; $k <= $count; $k++) {
            // The last instalment absorbs the rounding so the parts sum to the whole.
            $amount = $k < $count ? $each : round($value - $each * ($count - 1), 2);

            $dueVisit = $k === 1
                ? null
                : min($totalVisits, max($previousVisit + 1, (int) round($interval * ($k - 1))));

            if ($dueVisit !== null) {
                $previousVisit = $dueVisit;
            }

            $contract->payments()->create([
                'sequence' => $k,
                'amount' => $amount,
                'due_visit_sequence' => $dueVisit,
                'status' => 'due',
            ]);
        }
    }

    /** The term in years, from the two dates, matching the visit planner. */
    protected function termYears(Contract $contract): float
    {
        $days = CarbonImmutable::parse($contract->starts_on)->startOfDay()
            ->diffInDays(CarbonImmutable::parse($contract->ends_on)->startOfDay()) + 1;

        return $days / 365.25;
    }
}
