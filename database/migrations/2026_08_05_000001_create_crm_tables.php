<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The front of the funnel.
 *
 * A lead is a customer who has not said yes yet — the same contact fields, but
 * a pipeline status instead of a balance. Winning one turns it into a real
 * Customer and links back, so nothing typed while chasing the deal is retyped
 * once it lands.
 *
 * A follow-up is a promise to get back to someone by a date. It hangs off
 * either a lead or an existing customer, because both get chased, and a date
 * nobody is reminded of is the same as no date at all.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();           // LD-0001
            $table->string('name')->index();
            $table->string('company')->nullable();
            $table->string('phone', 32)->nullable()->index();
            $table->string('whatsapp', 32)->nullable();
            $table->string('email')->nullable();

            // Where they came from, so the sources that pay off are visible.
            $table->string('source', 32)->nullable();       // referral / call / walk_in / social / website / other
            $table->string('status', 16)->default('new')->index(); // new / contacted / qualified / won / lost
            $table->decimal('est_value', 14, 2)->nullable(); // rough deal size, for weighing the pipeline
            $table->text('notes')->nullable();
            $table->string('lost_reason')->nullable();       // only set when status is lost

            // The salesperson carrying it, and the customer it became.
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('follow_ups', function (Blueprint $table) {
            $table->id();
            // The lead or customer being chased.
            $table->string('subject_type');
            $table->unsignedBigInteger('subject_id');

            $table->string('type', 16)->default('call');    // call / visit / whatsapp / email / note
            $table->dateTime('due_at')->index();            // when it is meant to happen
            $table->dateTime('done_at')->nullable();        // when it did — null means still owed
            $table->text('note')->nullable();               // what to do
            $table->text('outcome')->nullable();            // what happened, filled on completion

            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->index(['subject_type', 'subject_id']);
            // The one query that runs on every dashboard: what is open and due.
            $table->index(['done_at', 'due_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('follow_ups');
        Schema::dropIfExists('leads');
    }
};
