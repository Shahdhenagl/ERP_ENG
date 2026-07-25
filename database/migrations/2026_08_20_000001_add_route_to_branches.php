<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The trip to a site, and what it costs — the "خط السير" sheet, per branch.
 *
 * Each site carries the legs of the journey to reach it (to Ramses, to the
 * Alexandria road, to the branch…), each with a fare, plus a daily allowance
 * and any lodging. Their sum is the float the technician is expected to need —
 * the "قيمة العهدة" the paper sheet leaves blank — which the actual expenses,
 * logged with receipts, are then measured against.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            // { legs: [{label, cost}], allowance, lodging, note }
            $table->json('route')->nullable()->after('working_hours');
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('route');
        });
    }
};
