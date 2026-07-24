<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A day's attendance per employee.
 *
 * One row per employee per day — the unique key is what makes recording twice a
 * correction rather than a duplicate. The status carries the day (present, late,
 * absent, on leave, or a holiday); the times and the hours worked hang off it
 * for the ones actually on site. Nothing here touches pay: the payroll reads
 * unpaid days off approved leave, and attendance is the operational record of
 * who showed up, kept beside it rather than wired into it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('date');

            $table->enum('status', ['present', 'late', 'absent', 'leave', 'holiday'])
                ->default('present');

            // Optional for a day that was worked; absent and leave leave them null.
            $table->time('check_in')->nullable();
            $table->time('check_out')->nullable();

            // Frozen at record time so a later change to shift hours cannot
            // silently rewrite what a month already reported.
            $table->unsignedSmallInteger('late_minutes')->default(0);
            $table->decimal('worked_hours', 5, 2)->default(0);

            $table->string('note')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            // One record per person per day; a second write updates the first.
            $table->unique(['employee_id', 'date']);
            $table->index(['date', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};
