<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The UPS nameplate: what a device is, beyond its serial. The registry already
 * held the make, model, capacity and serial; this adds the rest of the plate —
 * type and phase, the asset and barcode numbers, and the electrical specs an
 * engineer reads off the unit — so a device's record answers what it is without
 * anyone walking to the site.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            // ── Basic ──
            $table->string('name')->nullable()->after('serial');
            $table->string('asset_number', 64)->nullable()->after('name');
            $table->string('barcode', 120)->nullable()->after('asset_number');
            $table->string('ups_type', 20)->nullable()->after('model');   // online | offline | line_interactive
            $table->string('phase', 10)->nullable()->after('ups_type');    // single | three

            // ── Technical specifications ──
            $table->string('input_voltage', 60)->nullable()->after('capacity');
            $table->string('output_voltage', 60)->nullable()->after('input_voltage');
            $table->string('frequency', 40)->nullable()->after('output_voltage');
            $table->string('efficiency', 40)->nullable()->after('frequency');
            $table->string('power_factor', 20)->nullable()->after('efficiency');
            $table->string('battery_voltage', 40)->nullable()->after('power_factor');
            $table->unsignedSmallInteger('battery_count')->nullable()->after('battery_voltage');
            $table->unsignedInteger('backup_minutes')->nullable()->after('battery_count');
            $table->string('comm_port', 60)->nullable()->after('backup_minutes');   // USB / RS232 / SNMP
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn([
                'name', 'asset_number', 'barcode', 'ups_type', 'phase',
                'input_voltage', 'output_voltage', 'frequency', 'efficiency',
                'power_factor', 'battery_voltage', 'battery_count', 'backup_minutes', 'comm_port',
            ]);
        });
    }
};
