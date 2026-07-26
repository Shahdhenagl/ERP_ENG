<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The store now carries whole UPS units and battery banks as stock, not only
 * spare parts. That needs three things: a fourth value in the fixed category so
 * a unit can be filed as a UPS, a place to keep the nameplate that describes the
 * product (kept as JSON — the fields differ between a UPS and a battery and
 * neither belongs in twenty nullable columns), and a selling price, which — unlike
 * cost, which the receipts decide — is a number somebody quotes.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE items MODIFY category
             ENUM('ups', 'battery', 'spare_part', 'consumable') NOT NULL DEFAULT 'spare_part'",
        );

        Schema::table('items', function (Blueprint $table) {
            // The nameplate for a UPS or a battery product. Null for a part.
            $table->json('specs')->nullable()->after('avg_cost');
            // What we quote it at. Cost stays the weighted average from receipts.
            $table->decimal('sell_price', 12, 2)->nullable()->after('specs');
        });

        // Give the UPS category the same slug bridge the first three have, so the
        // enum value and the editable group stay in step. Adopt a UPS group the
        // operator may already have added by hand rather than leaving a twin.
        $ups = DB::table('item_categories')->where('slug', 'ups')->first();

        if (! $ups) {
            $existing = DB::table('item_categories')
                ->whereNull('slug')
                ->where(fn ($q) => $q->where('name', 'UPS')->orWhere('name', 'like', '%UPS%'))
                ->first();

            if ($existing) {
                DB::table('item_categories')->where('id', $existing->id)->update(['slug' => 'ups']);
            } else {
                DB::table('item_categories')->insert([
                    'name' => 'أجهزة UPS',
                    'slug' => 'ups',
                    'colour' => 'emerald',
                    'sort' => 0,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['specs', 'sell_price']);
        });

        DB::statement(
            "ALTER TABLE items MODIFY category
             ENUM('battery', 'spare_part', 'consumable') NOT NULL DEFAULT 'spare_part'",
        );
    }
};
