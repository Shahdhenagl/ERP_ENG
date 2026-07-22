<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Double entry underneath everything the company already does.
 *
 * Up to now money was recorded where it happened — an invoice knew its total, a
 * cash box knew its ledger, a supplier's balance was worked out from receipts
 * less payments. Each of those is true on its own and none of them can be added
 * up: there is no single place that says what the company owns and owes.
 *
 * This adds that place. Documents keep behaving exactly as they do; posting is
 * a consequence of them, written by the ledger service and keyed back to the
 * document that caused it, so nothing here is a second way to enter data.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── The chart ────────────────────────────────────────
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 16)->unique();               // 1102
            $table->string('name');

            $table->enum('type', ['asset', 'liability', 'equity', 'revenue', 'expense'])->index();

            $table->foreignId('parent_id')->nullable()->constrained('accounts')->nullOnDelete();

            // A heading, not a place to post. Totals roll up to it; entries
            // never land on it. Without the distinction a trial balance would
            // count the same money once on the child and again on the parent.
            $table->boolean('is_group')->default(false);

            /*
             * The name the posting rules know an account by, independent of
             * what it is called on screen. Renaming «العملاء» must not stop
             * invoices posting, and an operator must be free to rename it.
             */
            $table->string('key', 40)->nullable()->unique();

            // Seeded accounts the rules depend on: renaming is fine, deleting
            // is not.
            $table->boolean('is_system')->default(false);

            $table->boolean('is_active')->default(true)->index();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['parent_id', 'code']);
        });

        // ── Where the money was spent, as opposed to on what ──
        Schema::create('cost_centers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 16)->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true)->index();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // ── The journal ──────────────────────────────────────
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // JV-2026-0001
            $table->date('entry_date')->index();
            $table->string('memo')->nullable();

            $table->enum('source', [
                'manual',
                'invoice',
                'payment',
                'expense',
                'transfer',
                'supplier_payment',
                'custody',
                'stock',
                'opening',
            ])->default('manual')->index();

            /*
             * What produced the entry, and which moment of that thing's life.
             * An invoice posts once when issued and again when voided, so the
             * document alone is not enough to identify an entry.
             *
             * Written out rather than via nullableMorphs so the type column
             * stays short enough for the unique index below to be cheap.
             */
            $table->string('sourceable_type', 120)->nullable();
            $table->unsignedBigInteger('sourceable_id')->nullable();
            $table->string('event', 32)->nullable();

            // Both sides are equal by construction; storing one of them saves
            // every list screen from summing the lines to show a figure.
            $table->decimal('total', 14, 2)->default(0);

            $table->boolean('is_void')->default(false)->index();
            $table->foreignId('reverses_id')->nullable()->constrained('journal_entries')->nullOnDelete();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['sourceable_type', 'sourceable_id']);

            // Posting the same document event twice must be impossible rather
            // than merely unlikely — a retried request would otherwise double
            // the company's revenue. Manual entries leave all three null, and
            // MySQL permits any number of those.
            $table->unique(['sourceable_type', 'sourceable_id', 'event'], 'journal_entries_source_event_unique');
        });

        Schema::create('journal_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('journal_entry_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->constrained();
            $table->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();

            // One side is always zero. Kept as two columns rather than a signed
            // amount because that is how every ledger, statement and trial
            // balance in the world is read.
            $table->decimal('debit', 14, 2)->default(0);
            $table->decimal('credit', 14, 2)->default(0);

            $table->string('memo')->nullable();
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();

            // The general ledger reads by account and date; the date lives on
            // the entry, so this covers the join side of it.
            $table->index(['account_id', 'journal_entry_id']);
        });

        // ── Hooking the existing world up ────────────────────

        // Every box gets its own account, so «النقدية» on the balance sheet
        // breaks down into the same boxes the treasury screen shows.
        Schema::table('cash_boxes', function (Blueprint $table) {
            $table->foreignId('account_id')->nullable()->after('user_id')
                ->constrained('accounts')->nullOnDelete();
        });

        // An expense is the one movement whose other side cannot be inferred:
        // fuel and rent both leave the same box. Chosen when it is recorded,
        // and fallen back to a general heading when nobody chose.
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->foreignId('account_id')->nullable()->after('category')
                ->constrained('accounts')->nullOnDelete();
            $table->foreignId('cost_center_id')->nullable()->after('account_id')
                ->constrained('cost_centers')->nullOnDelete();
        });

        /*
         * `supplier_payment_id` has been on this table since purchasing landed
         * but was never in the model's fillable list, so it has been silently
         * dropped on every voucher written since. The column is filled in from
         * the note, which carries the voucher code, before anything starts
         * relying on the link.
         */
        DB::statement(<<<'SQL'
            UPDATE cash_movements m
              JOIN supplier_payments p ON m.note LIKE CONCAT(p.code, '%')
                                       OR m.note LIKE CONCAT('%', p.code)
               SET m.supplier_payment_id = p.id
             WHERE m.source = 'supplier_payment'
               AND m.supplier_payment_id IS NULL
        SQL);
    }

    public function down(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cost_center_id');
            $table->dropConstrainedForeignId('account_id');
        });

        Schema::table('cash_boxes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('account_id');
        });

        Schema::dropIfExists('journal_lines');
        Schema::dropIfExists('journal_entries');
        Schema::dropIfExists('cost_centers');
        Schema::dropIfExists('accounts');
    }
};
