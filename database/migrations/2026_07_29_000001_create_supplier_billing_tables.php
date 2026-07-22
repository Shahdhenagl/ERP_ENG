<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Supplier bills and purchase returns.
 *
 * The purchasing migration deliberately left the bill out: what was owed was
 * the value of what had arrived, less what had been paid. That is true as far
 * as it goes, and it breaks the moment anyone asks the two questions a payables
 * clerk actually asks — *which* invoice is this payment against, and *when* is
 * it due. It also has no room for the supplier's own invoice number, which is
 * what the tax authority and the supplier both refer to.
 *
 * The bill is therefore added as a document over receipts that already exist,
 * not as a replacement for them. This matters because a goods receipt already
 * credits the payable account at cost (see LedgerPoster::stockMovement). A bill
 * that credited it again would double the company's debt on every purchase.
 *
 * So a posted bill contributes only what the receipt could not know:
 *
 *   · the tax on it,
 *   · any difference between the price agreed and the price invoiced,
 *   · and its whole value, if there were no goods behind it at all —
 *     carriage, installation labour, a service call.
 *
 * `stock_movements.supplier_invoice_id` is what keeps the two from being
 * counted twice: a receipt is either covered by a bill or it is not, and
 * "received, not yet invoiced" is a number the payables screen can show.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // SB-2026-0001
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();

            // The supplier's own number. Theirs, not ours — it is what they
            // quote on the phone and what a tax audit matches against.
            $table->string('supplier_ref', 64)->nullable();

            $table->foreignId('purchase_order_id')->nullable()
                ->constrained()->nullOnDelete();

            $table->date('invoice_date');
            // Absent means "on demand"; overdue is derived from this and never
            // stored, because nothing on this host runs on a timer.
            $table->date('due_date')->nullable();

            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->char('currency', 3)->default('EGP');

            // Only what an operator sets. Whether it is paid is derived from
            // the payments allocated to it — a stored flag would be a second
            // truth that drifts the first time a payment is reversed.
            $table->enum('status', ['draft', 'posted', 'void'])->default('draft')->index();
            $table->string('void_reason')->nullable();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['supplier_id', 'status']);
            $table->index('due_date');
        });

        Schema::create('supplier_invoice_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_invoice_id')->constrained()->cascadeOnDelete();

            // Nullable: a bill for carriage or labour has no stock item behind
            // it, and refusing to record it would push it back onto paper.
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description', 300);

            $table->decimal('qty', 12, 3)->default(1);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->decimal('line_total', 14, 2)->default(0);
            $table->unsignedSmallInteger('sort')->default(0);

            $table->timestamps();
        });

        Schema::create('purchase_returns', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // PR-2026-0001
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_invoice_id')->nullable()
                ->constrained()->nullOnDelete();

            // Goods leave the store they are sitting in, so the return has to
            // name it — a company with three stores cannot guess.
            $table->foreignId('warehouse_id')->constrained();

            $table->date('return_date');
            $table->string('reason', 300);

            $table->enum('status', ['draft', 'posted'])->default('draft')->index();
            $table->decimal('total', 14, 2)->default(0);

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['supplier_id', 'status']);
        });

        Schema::create('purchase_return_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_return_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained();

            $table->decimal('qty', 12, 3);
            // Frozen when the return is posted: re-costing the item next month
            // must not rewrite what this return took off the debt.
            $table->decimal('unit_cost', 14, 2)->default(0);
            $table->decimal('line_total', 14, 2)->default(0);
            $table->unsignedSmallInteger('sort')->default(0);

            $table->timestamps();
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            // Which bill covers this receipt. Null means received but not yet
            // invoiced, which is a figure worth showing rather than hiding.
            $table->foreignId('supplier_invoice_id')->nullable()->after('purchase_order_id')
                ->constrained()->nullOnDelete();

            $table->foreignId('purchase_return_id')->nullable()->after('supplier_invoice_id')
                ->constrained()->nullOnDelete();
        });

        // Goods going back out to the supplier are not the same event as a
        // technician returning a part to the van: one reduces a debt, the
        // other reduces cost of sales.
        DB::statement(
            "ALTER TABLE stock_movements MODIFY type
             ENUM('receipt', 'transfer', 'issue', 'return', 'adjustment', 'purchase_return') NOT NULL",
        );

        Schema::table('supplier_payments', function (Blueprint $table) {
            // Which bill the money was against. Null is a payment on account —
            // legitimate, and the statement shows it as such rather than
            // guessing which invoice the supplier meant.
            $table->foreignId('supplier_invoice_id')->nullable()->after('supplier_id')
                ->constrained()->nullOnDelete();
        });

        // The journal groups entries by what raised them, and a supplier bill
        // is now one of those things. MySQL truncates an unknown enum value to
        // an empty string with only a warning, so leaving this out loses the
        // entry quietly rather than loudly.
        DB::statement(
            "ALTER TABLE journal_entries MODIFY source
             ENUM('manual', 'invoice', 'payment', 'expense', 'transfer',
                  'supplier_invoice', 'supplier_payment', 'custody', 'stock', 'opening')
             NOT NULL DEFAULT 'manual'",
        );
    }

    public function down(): void
    {
        DB::statement(
            "ALTER TABLE journal_entries MODIFY source
             ENUM('manual', 'invoice', 'payment', 'expense', 'transfer',
                  'supplier_payment', 'custody', 'stock', 'opening')
             NOT NULL DEFAULT 'manual'",
        );

        Schema::table('supplier_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('supplier_invoice_id');
        });

        DB::statement(
            "ALTER TABLE stock_movements MODIFY type
             ENUM('receipt', 'transfer', 'issue', 'return', 'adjustment') NOT NULL",
        );

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('purchase_return_id');
            $table->dropConstrainedForeignId('supplier_invoice_id');
        });

        Schema::dropIfExists('purchase_return_lines');
        Schema::dropIfExists('purchase_returns');
        Schema::dropIfExists('supplier_invoice_lines');
        Schema::dropIfExists('supplier_invoices');
    }
};
