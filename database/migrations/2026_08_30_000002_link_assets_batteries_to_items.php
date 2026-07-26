<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A UPS unit or a battery bank installed at a customer now comes out of stock,
 * so it points back at the catalogue item it was drawn from. Nullable, because
 * units registered before this — and any pre-existing equipment logged by hand —
 * never passed through the store. Set null on delete: retiring a catalogue item
 * must not erase the record of a device standing in the field.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('item_id')->nullable()->after('customer_id')
                ->constrained()->nullOnDelete();
        });

        Schema::table('batteries', function (Blueprint $table) {
            $table->foreignId('item_id')->nullable()->after('customer_id')
                ->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('item_id');
        });

        Schema::table('batteries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('item_id');
        });
    }
};
