<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When the first round actually goes out.
 *
 * Visits are spread at the midpoint of their slice, which puts the first one
 * about half an interval after the term starts — a fortnight into a monthly
 * contract. That is right when the start date is the installation itself, and
 * wrong whenever the customer has agreed a date. Nullable, so every contract
 * planned before this keeps the schedule it already has.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->date('first_visit_on')->nullable()->after('visits_per_year');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn('first_visit_on');
        });
    }
};
