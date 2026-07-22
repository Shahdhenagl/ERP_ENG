<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sales returns — the credit note.
 *
 * Purchase returns landed first, which left the mirror image missing: a
 * customer could hand a unit back and there was nothing to record it with. The
 * invoice stayed standing in full, the goods were physically in the store and
 * absent from the ledger, and the correction was a discount typed onto some
 * later invoice by someone who remembered.
 *
 * A return is raised against the invoice it reverses, never on its own, because
 * that is the only way to answer the question that stops abuse: has more been
 * sent back than was ever sold. It carries the same tax rate as the invoice, so
 * the tax reversed is the tax that was charged rather than today's rate.
 *
 * `restock` is per line and matters. A sealed part going back on the shelf is
 * worth what it cost; a burnt-out unit taken back for goodwill is worth nothing
 * and belongs in the write-off, not in stock. Treating both the same is how a
 * stock valuation quietly fills with scrap.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_returns', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // CN-2026-0001

            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            // Required: a credit with nothing behind it cannot be checked
            // against what was sold, and is a hole rather than a feature.
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();

            // Only needed when something is actually going back on a shelf.
            $table->foreignId('warehouse_id')->nullable()->constrained();

            $table->date('return_date');
            $table->string('reason', 300);

            // Only what an operator sets. Nothing moves — not the stock, not
            // the customer's balance — until this reads `posted`.
            $table->enum('status', ['draft', 'posted'])->default('draft')->index();

            $table->decimal('subtotal', 14, 2)->default(0);
            // Copied from the invoice at drafting: reversing at today's rate
            // would refund a different tax than the one collected.
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['customer_id', 'status']);
            $table->index(['invoice_id', 'status']);
        });

        Schema::create('sales_return_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_return_id')->constrained()->cascadeOnDelete();

            // Which line of the invoice is being reversed. Null covers a line
            // typed by hand, but the guard against over-returning needs this.
            $table->foreignId('invoice_line_id')->nullable()
                ->constrained('invoice_lines')->nullOnDelete();

            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description', 300);

            $table->decimal('qty', 12, 3);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->decimal('line_total', 14, 2)->default(0);

            // Whether the goods go back on the shelf, and what they cost when
            // they left. Frozen on posting so a later purchase moving the
            // average cannot rewrite this return's effect on the books.
            $table->boolean('restock')->default(true);
            $table->decimal('unit_cost', 14, 2)->default(0);

            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->foreignId('sales_return_id')->nullable()->after('purchase_return_id')
                ->constrained()->nullOnDelete();
        });

        // Goods coming back from a customer are not the same event as a
        // technician handing a part back to the van: one reverses a sale, the
        // other just moves stock between two places the company already owns.
        DB::statement(
            "ALTER TABLE stock_movements MODIFY type
             ENUM('receipt', 'transfer', 'issue', 'return', 'adjustment',
                  'purchase_return', 'sales_return') NOT NULL",
        );

        DB::statement(
            "ALTER TABLE journal_entries MODIFY source
             ENUM('manual', 'invoice', 'payment', 'expense', 'transfer',
                  'supplier_invoice', 'supplier_payment', 'sales_return',
                  'custody', 'stock', 'opening')
             NOT NULL DEFAULT 'manual'",
        );
    }

    public function down(): void
    {
        DB::statement(
            "ALTER TABLE journal_entries MODIFY source
             ENUM('manual', 'invoice', 'payment', 'expense', 'transfer',
                  'supplier_invoice', 'supplier_payment', 'custody', 'stock', 'opening')
             NOT NULL DEFAULT 'manual'",
        );

        DB::statement(
            "ALTER TABLE stock_movements MODIFY type
             ENUM('receipt', 'transfer', 'issue', 'return', 'adjustment', 'purchase_return') NOT NULL",
        );

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sales_return_id');
        });

        Schema::dropIfExists('sales_return_lines');
        Schema::dropIfExists('sales_returns');
    }
};
