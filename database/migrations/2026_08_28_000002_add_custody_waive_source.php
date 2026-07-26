<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Writing off a technician's overspend is a treasury movement of its own kind —
 * money the company decided not to pay — so it needs a place in the source
 * enum beside the advance and the settlement.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'expense', 'transfer', 'opening', 'supplier_payment',
                  'custody_advance', 'custody_settle', 'custody_waive', 'advance', 'payroll') NOT NULL",
        );
    }

    public function down(): void
    {
        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'expense', 'transfer', 'opening', 'supplier_payment',
                  'custody_advance', 'custody_settle', 'advance', 'payroll') NOT NULL",
        );
    }
};
