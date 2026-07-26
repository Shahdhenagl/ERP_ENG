<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A maintenance contract is now collected in instalments tied to its visits.
 *
 * The frequency decides how many instalments the term is split into; the first
 * is taken with the contract's activation, and each later one falls due at a
 * particular visit — the work order for that visit is held until it is paid. The
 * schedule is its own table, re-derivable while the contract is still a draft
 * and frozen the moment money is taken against it, exactly as a visit plan is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->enum('billing_frequency', ['upfront', 'quarterly', 'semi_annual', 'annual'])
                ->default('upfront')->after('value');
        });

        Schema::create('contract_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contract_id')->constrained()->cascadeOnDelete();

            $table->unsignedTinyInteger('sequence');            // 1..N
            $table->decimal('amount', 12, 2);

            // The visit whose work order this instalment gates. Null on the first
            // instalment — that one is taken with activation, before any visit.
            $table->unsignedTinyInteger('due_visit_sequence')->nullable();

            $table->enum('status', ['due', 'collected'])->default('due')->index();

            // What was raised and received when it was collected — real money
            // through the treasury, not a flag of its own.
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('collected_at')->nullable();
            $table->foreignId('collected_by')->nullable()->constrained('users')->nullOnDelete();

            $table->string('notes')->nullable();
            $table->timestamps();

            $table->unique(['contract_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_payments');

        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn('billing_frequency');
        });

        // Left for completeness; enum edits are a no-op on SQLite test runs.
        if (DB::getDriverName() === 'mysql') {
            // nothing else to reverse
        }
    }
};
