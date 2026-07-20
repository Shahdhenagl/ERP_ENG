<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Perpetual inventory on a weighted moving average.
 *
 * Balances live in `stock_levels` and every change is written to
 * `stock_movements`, so the ledger can always be replayed to prove a balance.
 * The two are only ever written together, inside a transaction, by StockLedger.
 *
 * UPS units are NOT stock — they are assets with their own registry. What is
 * stocked here is what gets consumed: batteries, spare parts, consumables.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // IT-0001
            $table->string('sku', 64)->nullable()->unique();    // the supplier's number
            $table->string('name');

            $table->enum('category', ['battery', 'spare_part', 'consumable'])
                ->default('spare_part')->index();

            $table->string('unit', 24)->default('قطعة');

            // Weighted moving average, recalculated on every receipt. Held on
            // the item rather than per warehouse: moving stock between the
            // store and a van does not change what it cost the company.
            $table->decimal('avg_cost', 12, 2)->default(0);

            // Below this, the item shows up on the reorder list.
            $table->decimal('reorder_level', 12, 3)->default(0);

            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('warehouses', function (Blueprint $table) {
            $table->id();
            $table->string('name');

            // `van` is a technician's custody — what they are carrying. It is
            // still a real stock location, which is what makes "who is holding
            // what right now" answerable.
            $table->enum('type', ['main', 'van'])->default('main')->index();

            // Set only for a van: the technician who answers for its contents.
            $table->foreignId('user_id')->nullable()->unique()->constrained()->cascadeOnDelete();

            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('stock_levels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $table->decimal('qty', 12, 3)->default(0);
            $table->timestamps();

            $table->unique(['item_id', 'warehouse_id']);
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();

            // A receipt has no source; an issue has no destination; a transfer
            // has both. Nullability is what encodes the direction.
            $table->foreignId('from_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->foreignId('to_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();

            $table->enum('type', [
                'receipt',      // bought in from a supplier
                'transfer',     // store → van, or back
                'issue',        // consumed on a job
                'return',       // reported used, then corrected back down
                'adjustment',   // stocktake correction
            ])->index();

            $table->decimal('qty', 12, 3);

            // What this movement cost per unit at the time. Stamped on the row
            // so history stays truthful after the average moves on.
            $table->decimal('unit_cost', 12, 2)->default(0);

            $table->foreignId('task_id')->nullable()->constrained()->nullOnDelete();
            $table->string('supplier')->nullable();
            $table->string('reference', 64)->nullable();        // supplier invoice no.
            $table->text('note')->nullable();

            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['item_id', 'created_at']);
            $table->index(['type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('stock_levels');
        Schema::dropIfExists('warehouses');
        Schema::dropIfExists('items');
    }
};
