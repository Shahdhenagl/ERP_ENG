<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Money into a box from someone who is not a customer on the books — a refund, an
 * outside party's deposit, the owner topping up the till — is a receipt of its
 * own kind, so it needs a place in the source enum beside the customer payment.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'external_deposit', 'expense', 'transfer', 'opening',
                  'supplier_payment', 'custody_advance', 'custody_settle',
                  'custody_waive', 'advance', 'payroll') NOT NULL",
        );
    }

    public function down(): void
    {
        DB::statement(
            "DELETE FROM cash_movements WHERE source = 'external_deposit'",
        );

        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'expense', 'transfer', 'opening', 'supplier_payment',
                  'custody_advance', 'custody_settle', 'custody_waive', 'advance', 'payroll') NOT NULL",
        );
    }
};
