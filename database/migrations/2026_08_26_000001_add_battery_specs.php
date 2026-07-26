<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The battery nameplate and its price. The registry held make, model, capacity
 * and voltage — enough to schedule a replacement, not enough to quote one or
 * describe the cell. This adds the rest of the plate (chemistry, size, terminal,
 * resistance, weight, dimensions, operating range) and the two figures a quote
 * needs: what it cost and what it sells for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('batteries', function (Blueprint $table) {
            // ── Basic ──
            $table->string('name')->nullable()->after('serial_number');
            $table->string('asset_tag', 64)->nullable()->after('name');
            $table->string('barcode', 120)->nullable()->after('asset_tag');
            $table->string('battery_type', 20)->nullable()->after('model');   // vrla | agm | gel | lithium_ion
            $table->string('size', 60)->nullable()->after('battery_type');

            // ── Technical ──
            $table->string('energy_wh', 40)->nullable()->after('voltage');
            $table->string('terminal_type', 60)->nullable()->after('energy_wh');
            $table->string('internal_resistance', 40)->nullable()->after('terminal_type');
            $table->string('weight', 40)->nullable()->after('internal_resistance');
            $table->string('dimensions', 80)->nullable()->after('weight');
            $table->string('operating_temperature', 60)->nullable()->after('dimensions');

            // ── Pricing ──
            $table->decimal('unit_cost', 12, 2)->nullable()->after('operating_temperature');
            $table->decimal('sell_price', 12, 2)->nullable()->after('unit_cost');
        });
    }

    public function down(): void
    {
        Schema::table('batteries', function (Blueprint $table) {
            $table->dropColumn([
                'name', 'asset_tag', 'barcode', 'battery_type', 'size',
                'energy_wh', 'terminal_type', 'internal_resistance', 'weight',
                'dimensions', 'operating_temperature', 'unit_cost', 'sell_price',
            ]);
        });
    }
};
