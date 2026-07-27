<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;

/**
 * Selling stock now moves stock.
 *
 * Until here an invoice was a purely financial document: its lines could name
 * an item, but issuing one left the warehouse untouched, so a store could sell
 * the same battery all month and still read as full. Two columns close that:
 *
 *  - `invoices.warehouse_id` — which store the goods leave from. Chosen on the
 *    document rather than fixed, because a company with a second store sells
 *    out of whichever one holds the goods. Null means the default store.
 *  - `stock_movements.invoice_id` — which invoice a movement belongs to, the
 *    same way purchase and sales returns already stamp theirs. Voiding an
 *    invoice has to put back exactly what that invoice took, and a note is not
 *    something you can query on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('sales_order_id')
                ->constrained()->nullOnDelete();
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->foreignId('invoice_id')->nullable()->after('sales_return_id')
                ->constrained()->nullOnDelete();
        });

        // Goods leaving on a sale are their own event: 'issue' is a part
        // consumed on a job, and reading a sale as job consumption would put
        // the cost against a work order that never touched it.
        DB::statement(
            "ALTER TABLE stock_movements MODIFY type
             ENUM('receipt', 'transfer', 'issue', 'return', 'adjustment',
                  'purchase_return', 'sales_return', 'sale', 'sale_void') NOT NULL",
        );
    }

    public function down(): void
    {
        DB::statement(
            "DELETE FROM stock_movements WHERE type IN ('sale', 'sale_void')",
        );

        DB::statement(
            "ALTER TABLE stock_movements MODIFY type
             ENUM('receipt', 'transfer', 'issue', 'return', 'adjustment',
                  'purchase_return', 'sales_return') NOT NULL",
        );

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('invoice_id');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->dropConstrainedForeignId('warehouse_id');
        });
    }
};
