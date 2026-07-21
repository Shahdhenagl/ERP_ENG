<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Custody in the three forms a technician actually holds it: stock, money,
 * and devices.
 *
 * Stock already worked — a van is a warehouse. This adds the other two, and
 * lets the company open more than one named store, which the previous
 * `main`/`van` split quietly ruled out.
 *
 * Devices are the case with no ledger of its own: a unit taken from a customer
 * for workshop repair, or one drawn from stock to install, is off the shelf and
 * not yet anywhere — and until now nothing recorded who had it.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── More than one store ──────────────────────────────
        // `store` replaces `main` as the type for a company warehouse, so
        // several can exist; `is_default` marks the one operations fall back to.
        DB::statement("ALTER TABLE warehouses MODIFY type ENUM('main', 'store', 'van') NOT NULL DEFAULT 'store'");

        Schema::table('warehouses', function (Blueprint $table) {
            $table->boolean('is_default')->default(false)->after('type');
            $table->text('address')->nullable()->after('name');
            $table->string('keeper', 160)->nullable()->after('address');
        });

        // The store that existed becomes the default one.
        $firstStore = DB::table('warehouses')->where('type', 'main')->orderBy('id')->value('id');

        if ($firstStore) {
            DB::table('warehouses')->where('id', $firstStore)->update(['is_default' => true]);
        }

        DB::table('warehouses')->where('type', 'main')->update(['type' => 'store']);
        DB::statement("ALTER TABLE warehouses MODIFY type ENUM('store', 'van') NOT NULL DEFAULT 'store'");

        // ── Cash custody ─────────────────────────────────────
        // A technician's float is a cash box they answer for. Reusing the box
        // rather than inventing a parallel ledger keeps every movement of money
        // in one place, and the treasury total stays true.
        Schema::table('cash_boxes', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->unique()->after('type')
                ->constrained()->nullOnDelete();
        });

        DB::statement("ALTER TABLE cash_boxes MODIFY type ENUM('cash', 'bank', 'custody') NOT NULL DEFAULT 'cash'");

        // Money moving to or from a technician is a transfer between boxes, so
        // it already has a source. What it lacked was a reason.
        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'expense', 'transfer', 'opening', 'supplier_payment', 'custody_advance', 'custody_settle') NOT NULL",
        );

        // ── Device custody ───────────────────────────────────
        Schema::create('asset_custodies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained();

            $table->enum('reason', [
                'workshop_repair',  // taken from the customer to be fixed
                'installation',     // drawn from stock, on its way to a site
                'inspection',
                'other',
            ])->default('workshop_repair');

            // Where it came from, in words — the customer site or the store.
            $table->string('taken_from', 160)->nullable();
            $table->foreignId('task_id')->nullable()->constrained()->nullOnDelete();

            $table->timestamp('taken_at');
            $table->timestamp('returned_at')->nullable();
            // Where it ended up: back to the customer, into stock, or scrapped.
            $table->string('returned_to', 160)->nullable();

            $table->text('note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['user_id', 'returned_at']);
            $table->index(['asset_id', 'returned_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('asset_custodies');

        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'expense', 'transfer', 'opening', 'supplier_payment') NOT NULL",
        );

        Schema::table('cash_boxes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });

        DB::statement("ALTER TABLE cash_boxes MODIFY type ENUM('cash', 'bank') NOT NULL DEFAULT 'cash'");

        DB::statement("ALTER TABLE warehouses MODIFY type ENUM('main', 'store', 'van') NOT NULL DEFAULT 'store'");
        DB::table('warehouses')->where('is_default', true)->update(['type' => 'main']);
        DB::statement("ALTER TABLE warehouses MODIFY type ENUM('main', 'van') NOT NULL DEFAULT 'main'");

        Schema::table('warehouses', function (Blueprint $table) {
            $table->dropColumn(['is_default', 'address', 'keeper']);
        });
    }
};
