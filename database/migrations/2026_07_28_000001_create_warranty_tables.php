<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Warranties and the claims made against them.
 *
 * Until now a warranty was two columns on the asset — `sold_at` plus
 * `warranty_months` — which can express "this unit is covered for a year" and
 * nothing else. It cannot express who is liable (us, or the manufacturer we
 * bought it from), an extension sold afterwards, or cover that moved to a
 * replacement unit. For a UPS company those are the cases that cost money.
 *
 * A warranty is therefore its own record, and an extension is a *new* record
 * pointing at the one it follows rather than an edit to the old dates. Editing
 * would destroy the evidence of what was originally promised, which is exactly
 * what gets argued about when a claim is refused.
 *
 * Cover is read as the latest end date across an asset's live warranties. The
 * asset columns stay as the fallback for units registered before this existed,
 * so nothing on file loses its cover the day this ships.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warranties', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // WR-2026-0001

            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            // Denormalised from the asset so a warranty survives the unit being
            // moved to another site, and so the certificate can be printed
            // without walking the relation.
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();

            // Who honours it. `company` is our own labour promise, `supplier`
            // is cover we can pass upstream — the difference decides whether a
            // repair costs us anything.
            $table->enum('kind', ['company', 'supplier', 'extension'])
                ->default('company')
                ->index();

            // What it pays for. Labour-only cover is common on installations
            // where the customer supplied the unit.
            $table->enum('covers', ['parts', 'labour', 'both'])->default('both');

            $table->date('starts_on');
            $table->date('ends_on');

            // An extension points at what it follows, so the chain can be read
            // end to end and the original terms stay legible.
            $table->foreignId('parent_id')->nullable()
                ->constrained('warranties')->nullOnDelete();

            // Where the cover came from. All optional: a warranty can be
            // registered by hand for a unit we did not sell.
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('supplier_reference', 64)->nullable();

            // Only what an operator sets. "Expired" is a fact about today's
            // date and is derived on read — nothing here runs on a timer.
            $table->enum('status', ['active', 'void'])->default('active')->index();
            $table->string('void_reason')->nullable();

            $table->text('terms')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            // The question asked on every claim: what covers this unit today.
            $table->index(['asset_id', 'status', 'ends_on']);
            $table->index('customer_id');
        });

        Schema::create('warranty_claims', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // CL-2026-0001

            $table->foreignId('warranty_id')->constrained()->cascadeOnDelete();
            // Repeated from the warranty because a claim can outlive a
            // replacement, at which point the two point at different units.
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();

            // The date the fault happened, not the date it was typed in. Cover
            // is judged against this, so a claim filed on Monday for a Friday
            // failure is still inside a warranty that lapsed on Saturday.
            $table->date('reported_on');
            $table->text('fault');

            $table->enum('status', [
                'open',        // filed, not yet judged
                'approved',    // covered — a repair order can be raised
                'rejected',    // not covered, with a reason
                'repaired',    // put right under the warranty
                'replaced',    // the unit was swapped
                'closed',      // finished, whatever the route
            ])->default('open')->index();

            $table->string('decision_note')->nullable();

            // The repair order is a work order like any other: the same
            // technician, dispatch and completion report. Duplicating that
            // machinery under a second name would only give it a second set of
            // bugs.
            $table->foreignId('task_id')->nullable()->constrained('tasks')->nullOnDelete();

            // Set when the fault was answered with a different unit. The cover
            // that remained moves with it, as its own warranty record.
            $table->foreignId('replacement_asset_id')->nullable()
                ->constrained('assets')->nullOnDelete();

            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['asset_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('warranty_claims');
        Schema::dropIfExists('warranties');
    }
};
