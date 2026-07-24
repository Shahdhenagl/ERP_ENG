<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tenders and bids — the public and corporate work won by competition.
 *
 * A tender is not a sale yet and not a quotation either: it is a bid to a
 * deadline, with a bond put up, that is either won or lost. Tracking it on its
 * own is what lets the desk see what is in flight, what is due when, and — over
 * time — how often the bidding actually converts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenders', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // TN-2026-0001

            // The tender's own reference, and who floated it.
            $table->string('reference_no', 120)->nullable();
            $table->string('entity', 200);                      // the issuing body
            $table->string('title', 300);

            // The account, when the issuer is one we already know.
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();

            $table->date('announced_on')->nullable();
            $table->date('submission_deadline')->nullable()->index();
            $table->date('opening_date')->nullable();

            $table->decimal('estimated_value', 16, 2)->nullable();
            // Bid bond / initial guarantee put up to enter.
            $table->decimal('bid_bond', 16, 2)->nullable();

            $table->enum('status', ['registered', 'submitted', 'won', 'lost', 'cancelled'])
                ->default('registered')->index();

            // Filled when it settles: the price it was awarded at, or why it lost.
            $table->decimal('awarded_value', 16, 2)->nullable();
            $table->string('result_note')->nullable();
            $table->date('decided_on')->nullable();

            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('description')->nullable();
            $table->text('notes')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'submission_deadline']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenders');
    }
};
