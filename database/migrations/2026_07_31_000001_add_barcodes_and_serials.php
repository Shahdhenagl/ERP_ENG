<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Barcodes on items, and serial tracking for the ones that need it.
 *
 * A UPS company sells two kinds of thing from the same shelf. Consumables —
 * cable, fuses, sealant — are counted, and a quantity is the whole truth about
 * them. Batteries, cards and whole units are not: the customer's warranty is on
 * a specific unit, a returned battery is a *particular* battery, and "we sent
 * back two of the four" is a sentence about identity, not quantity.
 *
 * So tracking is opt-in per item. Turning it on for cable ties would demand a
 * serial for every metre and make the storekeeper's job impossible; leaving it
 * off for batteries is why nobody can answer which unit failed.
 *
 * The serial is the record, and its `status` is where it is now. Movement is
 * expressed by updating that status alongside the stock movement that caused
 * it — the quantity ledger stays the authority on *how many*, and this answers
 * *which ones*.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // What the scanner reads. Distinct from `sku`, which is the
            // supplier's own number for the same thing.
            $table->string('barcode', 64)->nullable()->unique()->after('sku');

            // Off by default: an item that has never needed a serial should not
            // suddenly start refusing receipts.
            $table->boolean('tracks_serials')->default(false)->after('unit');
        });

        Schema::create('item_serials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();

            // Unique per item, not globally: two manufacturers can and do use
            // the same serial for different products.
            $table->string('serial', 64);

            $table->enum('status', [
                'in_stock',   // on a shelf, sellable
                'issued',     // consumed on a job or delivered to a customer
                'returned',   // came back, awaiting a decision
                'scrapped',   // written off, never to be sold again
            ])->default('in_stock')->index();

            // Where it is while it is in stock. Null once it has left.
            $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();

            // The movements that brought it in and took it out, so a serial can
            // be traced to a supplier at one end and a customer at the other.
            $table->foreignId('received_movement_id')->nullable()
                ->constrained('stock_movements')->nullOnDelete();
            $table->foreignId('issued_movement_id')->nullable()
                ->constrained('stock_movements')->nullOnDelete();

            $table->foreignId('asset_id')->nullable()->constrained()->nullOnDelete();
            $table->text('note')->nullable();

            $table->timestamps();

            $table->unique(['item_id', 'serial']);
            $table->index(['item_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_serials');

        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['barcode', 'tracks_serials']);
        });
    }
};
