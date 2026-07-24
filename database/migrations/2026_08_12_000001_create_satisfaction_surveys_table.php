<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How the customer rated a closed job.
 *
 * A ticket that was fixed says nothing about whether the customer was happy
 * with it. This captures that separately: one survey per job, opened when the
 * work is done and answered with a score out of five and a word or two. The
 * average and the response rate are read back off these — a stored score column
 * on the task would be a second place for the same number to live and drift.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('satisfaction_surveys', function (Blueprint $table) {
            $table->id();

            // One per job. Nullable so a general survey is possible, unique so a
            // job is never surveyed twice.
            $table->foreignId('task_id')->nullable()->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();

            $table->enum('status', ['pending', 'responded'])->default('pending')->index();

            // One to five, null until answered — the distinction between "rated
            // one" and "not yet rated" is the whole point of the response rate.
            $table->unsignedTinyInteger('rating')->nullable();
            $table->text('comment')->nullable();

            $table->timestamp('sent_at')->nullable();
            $table->timestamp('responded_at')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'rating']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('satisfaction_surveys');
    }
};
