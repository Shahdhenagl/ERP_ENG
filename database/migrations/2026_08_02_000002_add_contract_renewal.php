<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which contract a contract renewed.
 *
 * A renewal is a new contract, not an edit to the old one: last year's term,
 * price and visit plan are the record of what was actually delivered, and
 * moving the dates would erase it. The link is what keeps the two readable as
 * one relationship rather than two unrelated documents with the same customer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->foreignId('renewed_from_id')->nullable()->after('customer_id')
                ->constrained('contracts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('renewed_from_id');
        });
    }
};
