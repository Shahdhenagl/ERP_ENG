<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether this account buys on credit or pays on the spot.
 *
 * It decides how the sale is written before anything is sold: a cash account
 * settles at delivery, a credit account is invoiced and chased. The system
 * could infer it from history, but a new customer has none — and inferring it
 * is how somebody ends up extending credit to an account that was never
 * granted any.
 *
 * Defaults to cash, the safer of the two to assume.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('payment_terms', 12)->default('cash')->after('type');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('payment_terms');
        });
    }
};
