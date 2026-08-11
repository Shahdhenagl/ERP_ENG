<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Find all tasks that have a postponement request that was approved,
        // but their current status is not 'postponed', 'completed', or 'cancelled'.
        // We only update tasks where the most recent postponement request is 'approved'.
        
        $tasksToUpdate = DB::table('tasks')
            ->whereNotIn('status', ['completed', 'cancelled', 'postponed'])
            ->whereExists(function ($query) {
                $query->select(DB::raw(1))
                      ->from('task_postponements')
                      ->whereColumn('task_postponements.task_id', 'tasks.id')
                      ->where('task_postponements.status', 'approved')
                      ->whereRaw('task_postponements.id = (SELECT MAX(id) FROM task_postponements WHERE task_id = tasks.id)');
            })
            ->pluck('id');

        if ($tasksToUpdate->isNotEmpty()) {
            DB::table('tasks')
                ->whereIn('id', $tasksToUpdate)
                ->update(['status' => 'postponed']);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No down migration needed for data backfill.
    }
};
