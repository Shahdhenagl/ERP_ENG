<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The people at a customer, as opposed to the account itself.
 *
 * A customer is an organisation; the person who signs the order, the engineer
 * who lets the technician in and the accountant who pays are three different
 * people at it, each with their own line. The customer's own phone stays on the
 * customer — this is for everyone else, so a call goes to the right person
 * rather than the switchboard.
 *
 * One of them can be marked primary — the default the rest of the system rings
 * when it needs "the customer" and nobody picked a name.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contacts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // CT-0001
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();

            $table->string('name', 160);
            $table->string('job_title', 120)->nullable();
            $table->string('department', 120)->nullable();

            $table->string('phone', 32)->nullable();
            $table->string('whatsapp', 32)->nullable();
            $table->string('email', 160)->nullable();

            // At most one per customer — enforced in the model, not the schema,
            // because "one true" is awkward to express as a unique index.
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['customer_id', 'is_primary']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contacts');
    }
};
