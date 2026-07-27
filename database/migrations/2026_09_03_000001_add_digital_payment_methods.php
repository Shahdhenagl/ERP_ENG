<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * InstaPay and Vodafone Cash are how customers actually pay here, so they earn
 * their own place in the method list rather than hiding inside a generic
 * "wallet". Both the customer receipts and the supplier payments carry the same
 * set, so the two enums move together.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['payments', 'supplier_payments'] as $table) {
            DB::statement(
                "ALTER TABLE {$table} MODIFY method
                 ENUM('cash', 'bank_transfer', 'instapay', 'vodafone_cash', 'cheque', 'wallet')
                 NOT NULL DEFAULT 'cash'",
            );
        }
    }

    public function down(): void
    {
        foreach (['payments', 'supplier_payments'] as $table) {
            DB::statement(
                "ALTER TABLE {$table} MODIFY method
                 ENUM('cash', 'bank_transfer', 'cheque', 'wallet') NOT NULL DEFAULT 'cash'",
            );
        }
    }
};
