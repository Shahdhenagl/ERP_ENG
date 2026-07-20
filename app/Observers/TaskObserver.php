<?php

namespace App\Observers;

use App\Models\Task;
use App\Services\ContractSla;

/**
 * Jobs are created from more than one place — the dispatcher's form and the
 * maintenance planner today, and intake channels later. Stamping SLA here
 * rather than in a controller is what keeps a new path from silently shipping
 * without deadlines.
 */
class TaskObserver
{
    public function __construct(protected ContractSla $sla) {}

    public function creating(Task $task): void
    {
        $this->sla->stamp($task);
    }
}
