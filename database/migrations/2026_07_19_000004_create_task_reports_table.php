<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();

            // diagnosis: filed on arrival · completion: filed when closing the job
            $table->enum('type', ['diagnosis', 'completion'])->index();

            // Electrical readings kept as typed columns (not free text) so they can be
            // trended per device over time — see docs/requirements-analysis.md §2.2.
            $table->decimal('input_voltage', 8, 2)->nullable();
            $table->decimal('output_voltage', 8, 2)->nullable();
            $table->decimal('frequency', 6, 2)->nullable();
            $table->decimal('load_percent', 5, 2)->nullable();
            $table->decimal('battery_voltage', 8, 2)->nullable();
            $table->decimal('temperature', 5, 2)->nullable();
            $table->integer('backup_minutes')->nullable();

            $table->enum('device_condition', ['good', 'fair', 'poor', 'faulty'])->nullable();
            $table->boolean('batteries_need_replacement')->default(false);

            $table->text('findings')->nullable();          // what the technician observed
            $table->text('actions_taken')->nullable();     // what they did
            $table->text('recommendations')->nullable();   // follow-up advice
            $table->json('parts_used')->nullable();        // [{name, qty, note}]

            $table->string('signature_path')->nullable();  // customer signature image
            $table->string('signed_by_name')->nullable();
            $table->timestamp('signed_at')->nullable();

            $table->timestamps();
            $table->index(['task_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_reports');
    }
};
