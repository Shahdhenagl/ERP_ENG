<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The front of the commercial chain: a price offered, then an order agreed.
 *
 * quotation → sales order → invoice, each one copying its lines forward and
 * keeping a pointer back. Copying rather than sharing is deliberate: a quote
 * is a historical document, and re-pricing an item two months later must not
 * silently rewrite what the customer was told.
 *
 * A quotation can also be turned down or left to lapse, which an invoice
 * cannot — that is the whole reason it is a separate document rather than a
 * draft invoice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quotations', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // QT-2026-0001
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();

            // What the quote is about, when it is about something already known.
            $table->foreignId('asset_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('task_id')->nullable()->constrained()->nullOnDelete();

            $table->string('title')->nullable();
            $table->date('issue_date');
            // Past this, the price is no longer promised.
            $table->date('valid_until')->nullable();

            // Only what an operator sets. "Expired" is a fact about today's
            // date and is derived, the same way contract status is.
            $table->enum('status', ['draft', 'sent', 'accepted', 'rejected', 'cancelled'])
                ->default('draft')->index();

            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->string('currency', 8)->default('EGP');

            $table->text('terms')->nullable();                  // payment/delivery terms
            $table->text('notes')->nullable();
            $table->text('reject_reason')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('decided_at')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['customer_id', 'status']);
        });

        Schema::create('quotation_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quotation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();

            $table->string('description');
            $table->decimal('qty', 12, 3)->default(1);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->decimal('line_total', 14, 2)->default(0);
            $table->string('item_code', 64)->nullable();

            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('sales_orders', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // SO-2026-0001
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            // Where it came from, when it came from a quote.
            $table->foreignId('quotation_id')->nullable()->constrained()->nullOnDelete();

            $table->date('order_date');
            $table->date('delivery_date')->nullable();

            $table->enum('status', ['open', 'delivered', 'cancelled'])->default('open')->index();

            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->string('currency', 8)->default('EGP');

            $table->text('notes')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['customer_id', 'status']);
        });

        Schema::create('sales_order_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();

            $table->string('description');
            $table->decimal('qty', 12, 3)->default(1);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->decimal('line_total', 14, 2)->default(0);
            $table->string('item_code', 64)->nullable();

            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('sales_order_id')->nullable()->after('contract_id')
                ->constrained()->nullOnDelete();
        });

        // An installation job raised off the back of an order — the link that
        // turns a sale into work for the technicians.
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('sales_order_id')->nullable()->after('contract_id')
                ->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sales_order_id');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sales_order_id');
        });

        Schema::dropIfExists('sales_order_lines');
        Schema::dropIfExists('sales_orders');
        Schema::dropIfExists('quotation_lines');
        Schema::dropIfExists('quotations');
    }
};
