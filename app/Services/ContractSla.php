<?php

namespace App\Services;

use App\Enums\TaskType;
use App\Models\Contract;
use App\Models\Task;
use Illuminate\Database\Eloquent\Builder;

/**
 * Works out which contract governs a job and when it falls due under it.
 *
 * Pure computation — it stamps the model and never saves. Persistence belongs
 * to whoever created the task.
 */
class ContractSla
{
    /**
     * Attach the job to its contract, if any, and freeze the deadlines that
     * contract implies.
     *
     * The due timestamps are stored rather than derived because they record
     * the terms in force when the job was logged: re-pricing the contract next
     * year must not rewrite last year's breach record. Whether a job actually
     * breached stays derived — see Task::scopeSlaBreached().
     */
    public function stamp(Task $task): void
    {
        $task->contract_id ??= $this->resolveFor($task)?->id;

        if (! $task->contract_id) {
            return;
        }

        $contract = $task->contract ?? Contract::find($task->contract_id);

        if (! $contract) {
            return;
        }

        $from = $this->clockStartsAt($task);

        if ($contract->sla_response_hours) {
            $task->response_due_at ??= $from->copy()->addHours($contract->sla_response_hours);
        }

        if ($contract->sla_resolution_hours) {
            $task->resolution_due_at ??= $from->copy()->addHours($contract->sla_resolution_hours);
        }
    }

    /**
     * When the clock starts.
     *
     * A breakdown call is late from the moment it is logged — the customer is
     * already waiting. A planned visit is not: nobody is late for an
     * appointment that has not come round yet. Without that distinction every
     * visit cut ahead of time would be born in breach.
     */
    protected function clockStartsAt(Task $task): \Carbon\CarbonInterface
    {
        if ($task->type === TaskType::Maintenance && $task->scheduled_at) {
            return $task->scheduled_at->copy();
        }

        return now();
    }

    /**
     * The contract covering this job, if the customer has one running.
     *
     * A contract naming specific devices beats a blanket one when the job is
     * about a device it names. Overlapping contracts are rejected at the
     * controller, so this ordering is a safety net rather than load-bearing.
     */
    public function resolveFor(Task $task): ?Contract
    {
        if (! $task->customer_id) {
            return null;
        }

        return Contract::query()
            ->activeOn(now()->toDateString())
            ->where('customer_id', $task->customer_id)
            ->when($task->asset_id, fn (Builder $q, int $assetId) => $q->where(
                fn (Builder $w) => $w
                    ->whereDoesntHave('assets')
                    ->orWhereHas('assets', fn (Builder $a) => $a->whereKey($assetId)),
            ))
            ->withCount('assets')
            ->orderByDesc('assets_count')
            ->orderByDesc('starts_on')
            ->first();
    }
}
