<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Purchase requests — the step before an order.
 *
 * Today a technician who runs out of something rings the office, and whether it
 * gets bought depends on whether the person who answered wrote it down. There
 * is no record that the request was made, no way to see what is waiting, and no
 * way to tell afterwards whether a job was delayed because nobody ordered.
 *
 * The request is deliberately the technician's document, not the manager's:
 * it is raised by the person who discovers the need, and approving it is a
 * separate act by someone else. That separation is the whole point — a request
 * that its own author could approve records nothing a phone call did not.
 *
 * Turning one into a purchase order links the two, so a delivery months later
 * can still be traced back to the van it was needed in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_requests', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // PR-2026-0001

            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            // The job that ran short, when there is one. It is what turns "we
            // need two batteries" into "we need them for this customer".
            $table->foreignId('task_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();

            $table->date('needed_by')->nullable();
            $table->text('reason')->nullable();

            $table->enum('status', [
                'draft',      // still being written by the requester
                'submitted',  // waiting on someone else
                'approved',   // agreed, may become an order
                'rejected',   // refused, with a reason on the record
                'ordered',    // a purchase order was raised from it
            ])->default('draft')->index();

            $table->enum('priority', ['low', 'normal', 'high', 'urgent'])->default('normal');

            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_note')->nullable();

            // Set when it becomes an order, so the trail runs both ways.
            $table->foreignId('purchase_order_id')->nullable()
                ->constrained()->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['requested_by', 'status']);
        });

        Schema::create('purchase_request_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_request_id')->constrained()->cascadeOnDelete();

            // Nullable: a technician needing something the catalogue has never
            // carried should be able to ask for it by name rather than be told
            // to create an item record first.
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description', 300);

            $table->decimal('qty', 12, 3);
            $table->string('unit', 24)->nullable();
            $table->text('note')->nullable();
            $table->unsignedSmallInteger('sort')->default(0);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_request_lines');
        Schema::dropIfExists('purchase_requests');
    }
};
