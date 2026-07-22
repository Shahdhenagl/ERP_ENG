<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cheques, in and out — and bank reconciliation.
 *
 * Until now a cheque was recorded as a payment method and the money hit the
 * treasury the moment it was written down. That is wrong twice over: a cheque
 * in the drawer is not cash, and a cheque we have written is not spent until
 * the other side presents it. A company that trusts that figure plans against
 * money it does not have.
 *
 * So a cheque is a document of its own, and it deliberately does **not** touch
 * the treasury or the invoice while it is merely held. The invoice stays
 * outstanding, the bank balance stays what the bank says, and clearing the
 * cheque is what produces the receipt or the payment voucher.
 *
 * That also avoids a second truth about what is owed. The receivable is
 * derived from invoices and their receipts; adding a "cheques under
 * collection" balance beside it would give two answers to one question, and
 * they would disagree the first time a cheque bounced.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cheques', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // CHQ-2026-0001

            // Incoming: a customer handed it to us. Outgoing: we wrote it.
            $table->enum('direction', ['incoming', 'outgoing'])->index();

            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();

            // What it is meant to settle, when it is against a specific
            // document rather than the account as a whole.
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_invoice_id')->nullable()->constrained()->nullOnDelete();

            // The number printed on the paper, and whose bank it is drawn on.
            $table->string('cheque_number', 64);
            $table->string('bank_name', 120)->nullable();
            // Whose name is on it, which is not always the customer's.
            $table->string('party_name', 160)->nullable();

            $table->date('issue_date');
            // The date it can be presented. Everything about a cheque that
            // matters operationally hangs off this.
            $table->date('due_date')->index();

            $table->decimal('amount', 14, 2);

            $table->enum('status', [
                'held',       // in the drawer, or written and not yet handed over
                'deposited',  // with the bank, waiting
                'cleared',    // the money actually moved
                'bounced',    // returned unpaid
                'cancelled',  // torn up before it ever went anywhere
            ])->default('held')->index();

            // Which bank account it was paid into, or drawn on.
            $table->foreignId('cash_box_id')->nullable()->constrained()->nullOnDelete();

            // Set on clearing. Until then there is no receipt and no voucher,
            // because nothing has been received or paid.
            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_payment_id')->nullable()
                ->constrained()->nullOnDelete();

            $table->date('deposited_on')->nullable();
            $table->date('settled_on')->nullable();
            $table->string('bounce_reason')->nullable();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['direction', 'status', 'due_date']);
            $table->index(['cheque_number', 'direction']);
        });

        Schema::table('cash_movements', function (Blueprint $table) {
            // Bank reconciliation: ticked off against a statement line.
            // Nullable rather than a boolean so the log says *when* it was
            // agreed, which is the part an auditor asks about.
            $table->timestamp('reconciled_at')->nullable()->after('note');
            $table->foreignId('reconciled_by')->nullable()->after('reconciled_at')
                ->constrained('users')->nullOnDelete();

            $table->index('reconciled_at');
        });
    }

    public function down(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reconciled_by');
            $table->dropColumn('reconciled_at');
        });

        Schema::dropIfExists('cheques');
    }
};
