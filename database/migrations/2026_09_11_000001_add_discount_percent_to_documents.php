<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A discount agreed as a percentage.
 *
 * `discount` stays what it has always been — the money coming off the subtotal —
 * so every total, tax base and journal entry downstream keeps reading one field
 * and needs no change. This records that the figure was arrived at as a rate,
 * which is what lets the document say "خصم ١٠٪" and lets the amount follow the
 * subtotal when a line is edited.
 *
 * Null means the discount was entered as a flat amount, which is every discount
 * entered before today.
 */
return new class extends Migration
{
    /** Every document that carries a discount. */
    protected array $tables = ['quotations', 'invoices', 'sales_orders', 'supplier_invoices'];

    public function up(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->decimal('discount_percent', 5, 2)->nullable()->after('discount');
            });
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('discount_percent');
            });
        }
    }
};
