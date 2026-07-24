<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Supplier quotations — the prices asked for before an order is placed.
 *
 * The buying cycle had a hole in the middle: a request for goods went straight
 * to an order, with no record of the quotes weighed to pick a supplier. This
 * keeps them, so the decision can be seen and compared: several quotes against
 * one request, and the one chosen becomes the purchase order it turns into.
 *
 * A quote is a document of its own and touches nothing — no stock, no money,
 * no ledger — until it is selected and an order is raised from it. Its total is
 * the sum of its lines, never a stored column, the same way an order's is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_quotes', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // SQ-2026-0001
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();

            // The request being priced, when the quote answers one. Several
            // quotes share it, which is what makes them comparable.
            $table->foreignId('purchase_request_id')->nullable()
                ->constrained()->nullOnDelete();

            $table->date('quote_date');
            $table->date('valid_until')->nullable();

            $table->enum('status', ['received', 'selected', 'rejected'])
                ->default('received')->index();

            // Days from order to delivery, part of the comparison — the cheapest
            // is not the best if it arrives a month late.
            $table->unsignedSmallInteger('lead_days')->nullable();
            $table->decimal('tax_rate', 5, 2)->default(0);

            // Set when the quote is chosen and turned into an order.
            $table->foreignId('purchase_order_id')->nullable()
                ->constrained()->nullOnDelete();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['purchase_request_id', 'status']);
            $table->index(['supplier_id', 'status']);
        });

        Schema::create('supplier_quote_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_quote_id')->constrained()->cascadeOnDelete();

            // An item when the quote priced one of the catalogue; free text when
            // it is for something not yet a stock item.
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description')->nullable();

            $table->decimal('qty', 12, 3);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_quote_lines');
        Schema::dropIfExists('supplier_quotes');
    }
};
