<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Purchasing: who supplies the goods, what was ordered, what actually arrived,
 * and what is still owed for it.
 *
 * Before this, a goods receipt carried the supplier as free text — so the same
 * company could be spelled three ways, nothing could be totalled against them,
 * and stock could be received that nobody had ordered. Existing text names are
 * promoted to real supplier records rather than dropped.
 *
 * There is deliberately no separate supplier-bill document: what the company
 * owes is the value of what it has received, less what it has paid. Adding a
 * bill in between would be a second source of the same truth.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // SP-0001
            $table->string('name');
            $table->string('company')->nullable();
            $table->string('phone', 32)->nullable();
            $table->string('whatsapp', 32)->nullable();
            $table->string('email', 160)->nullable();
            $table->text('address')->nullable();
            $table->string('tax_id', 32)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // PO-2026-0001
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();

            $table->date('order_date');
            $table->date('expected_date')->nullable();

            // Only what an operator sets. How much has arrived is derived from
            // the receipts, so a partly-received order cannot go stale.
            $table->enum('status', ['draft', 'sent', 'cancelled'])->default('draft')->index();

            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->string('currency', 8)->default('EGP');
            $table->text('notes')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['supplier_id', 'status']);
        });

        Schema::create('purchase_order_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained();

            $table->decimal('qty', 12, 3);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        // Money paid out to a supplier. Mirrors `payments` on the sales side.
        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // PV-2026-0001
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cash_box_id')->constrained();

            $table->decimal('amount', 14, 2);
            $table->enum('method', ['cash', 'bank_transfer', 'cheque', 'wallet'])
                ->default('cash')->index();

            $table->date('paid_at');
            $table->string('reference', 64)->nullable();
            $table->text('note')->nullable();

            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['supplier_id', 'paid_at']);
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->foreignId('supplier_id')->nullable()->after('task_id')
                ->constrained()->nullOnDelete();
            $table->foreignId('purchase_order_id')->nullable()->after('supplier_id')
                ->constrained()->nullOnDelete();
        });

        // Paying a supplier is money out of a box like any other, but it needs
        // its own heading so the treasury can tell it from a petty expense.
        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'expense', 'transfer', 'opening', 'supplier_payment') NOT NULL",
        );

        Schema::table('cash_movements', function (Blueprint $table) {
            $table->foreignId('supplier_payment_id')->nullable()->after('payment_id')
                ->constrained()->nullOnDelete();
        });

        // Promote the free-text supplier names already on receipts. Matched
        // case-insensitively so "النور" and "النور " become one record.
        $names = DB::table('stock_movements')
            ->whereNotNull('supplier')
            ->where('supplier', '!=', '')
            ->pluck('supplier')
            ->map(fn ($name) => trim($name))
            ->filter()
            ->unique(fn ($name) => mb_strtolower($name));

        $next = 0;

        foreach ($names as $name) {
            $next++;

            $id = DB::table('suppliers')->insertGetId([
                'code' => 'SP-'.str_pad((string) $next, 4, '0', STR_PAD_LEFT),
                'name' => $name,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('stock_movements')
                ->whereRaw('LOWER(TRIM(supplier)) = ?', [mb_strtolower($name)])
                ->update(['supplier_id' => $id]);
        }

        // The text column stays for now: dropping it in the same migration that
        // copies it out leaves no way to check the move went right.
    }

    public function down(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('supplier_payment_id');
        });

        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'expense', 'transfer', 'opening') NOT NULL",
        );

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('purchase_order_id');
            $table->dropConstrainedForeignId('supplier_id');
        });

        Schema::dropIfExists('supplier_payments');
        Schema::dropIfExists('purchase_order_lines');
        Schema::dropIfExists('purchase_orders');
        Schema::dropIfExists('suppliers');
    }
};
