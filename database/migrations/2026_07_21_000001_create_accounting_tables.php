<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Receivables and treasury: what customers owe, what has been collected, and
 * where the money sits.
 *
 * Deliberately not a general ledger. There is no chart of accounts and no
 * double entry — invoices and receipts are the source documents, and a GL can
 * be posted from them later without moving any of this.
 *
 * Cash balances follow the same shape that worked for stock: `cash_movements`
 * is the ledger, a box's balance is the sum of its movements, and only
 * BillingService writes either.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();              // INV-2026-0001

            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            // What was billed for. Both optional: an invoice can be raised by
            // hand for something with no job behind it.
            $table->foreignId('task_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('contract_id')->nullable()->constrained()->nullOnDelete();

            $table->date('issue_date');
            $table->date('due_date')->nullable();

            // Only what an operator sets. Whether it is paid is derived from the
            // receipts against it — a stored flag would drift the first time a
            // payment was edited, and nothing here runs on a timer to fix it.
            $table->enum('status', ['draft', 'issued', 'void'])->default('draft')->index();

            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('tax_rate', 5, 2)->default(0);      // percent, e.g. 14.00
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);

            $table->string('currency', 8)->default('EGP');

            // Prepared for the Egyptian e-invoicing portal, unused for now.
            // Carrying them from the start means no data migration later.
            $table->string('customer_tax_id', 32)->nullable();
            $table->uuid('eta_uuid')->nullable();
            $table->string('eta_submission_id', 64)->nullable();
            $table->timestamp('eta_submitted_at')->nullable();

            $table->text('notes')->nullable();
            $table->text('void_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['customer_id', 'status']);
            $table->index('issue_date');
        });

        Schema::create('invoice_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();

            // Set when the line came off the stock catalogue; null for labour
            // and anything else that is not an item.
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();

            $table->string('description');
            $table->decimal('qty', 12, 3)->default(1);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->decimal('line_total', 14, 2)->default(0);

            // The item's code at the time, for the e-invoice payload later.
            $table->string('item_code', 64)->nullable();

            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('cash_boxes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('type', ['cash', 'bank'])->default('cash')->index();
            $table->string('account_number', 64)->nullable();   // for a bank box
            $table->string('currency', 8)->default('EGP');
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // RC-2026-0001

            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            // Null means money received on account, not against one invoice.
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('cash_box_id')->constrained();

            $table->decimal('amount', 14, 2);
            $table->enum('method', ['cash', 'bank_transfer', 'cheque', 'wallet'])
                ->default('cash')->index();

            $table->date('paid_at');
            $table->string('reference', 64)->nullable();        // cheque or transfer no.
            $table->text('note')->nullable();

            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['customer_id', 'paid_at']);
        });

        Schema::create('cash_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cash_box_id')->constrained()->cascadeOnDelete();

            // Direction is explicit rather than signed on the amount: signing
            // both is how a ledger stops adding up.
            $table->enum('direction', ['in', 'out'])->index();
            $table->decimal('amount', 14, 2);

            $table->enum('source', [
                'payment',      // a customer receipt
                'expense',      // money spent out of the box
                'transfer',     // between two boxes
                'opening',      // starting balance
            ])->index();

            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('counterpart_box_id')->nullable()->constrained('cash_boxes')->nullOnDelete();

            $table->string('category', 64)->nullable();         // expense heading
            $table->text('note')->nullable();

            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['cash_box_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_movements');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('cash_boxes');
        Schema::dropIfExists('invoice_lines');
        Schema::dropIfExists('invoices');
    }
};
