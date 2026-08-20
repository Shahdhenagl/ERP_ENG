<?php

namespace App\Services;

use App\Models\Contract;
use Carbon\CarbonImmutable;

/**
 * Lays a contract's value out as instalments across its visits.
 *
 * The cadence remains per contract year: quarterly is four instalments per
 * year, independent from the number of visits. Arrears schedules describe the
 * service range each instalment covers; upfront schedules retain the legacy
 * activation/visit gate for existing contracts.
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
        $each = round($value / $count, 2);
        $perYear = $contract->instalmentsPerYear();

        for ($k = 1; $k <= $count; $k++) {
            // The last instalment absorbs the rounding so the parts sum to the whole.
            $amount = $k < $count ? $each : round($value - $each * ($count - 1), 2);

            $fromVisit = (int) floor((($k - 1) * $totalVisits) / $count) + 1;
            $toVisit = (int) floor(($k * $totalVisits) / $count);
            $toVisit = max($fromVisit, min($totalVisits, $toVisit));

            $arrears = $contract->isArrears();
            $dueVisit = $arrears
                ? $toVisit
                : ($k === 1 ? null : (int) floor((($k - 1) * $totalVisits) / $count));

            $contract->payments()->create([
                'sequence' => $k,
                'amount' => $amount,
                'service_year' => (int) ceil($k / $perYear),
                'period_number' => (($k - 1) % $perYear) + 1,
                'due_visit_sequence' => $dueVisit,
                'service_from_visit_sequence' => $fromVisit,
                'service_to_visit_sequence' => $toVisit,
                'due_on' => null,
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
