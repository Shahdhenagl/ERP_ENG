<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a follow-up was reminded about.
 *
 * A reminder that fires every night for the same overdue follow-up is noise,
 * and noise is what gets a whole channel muted. This column is the memory that
 * makes the reminder fire once — the day it comes due — and then stay quiet.
 * The dashboard keeps showing it overdue; the push does not keep shouting.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('follow_ups', function (Blueprint $table) {
            $table->dateTime('reminded_at')->nullable()->after('done_at');
        });
    }

    public function down(): void
    {
        Schema::table('follow_ups', function (Blueprint $table) {
            $table->dropColumn('reminded_at');
        });
    }
};
