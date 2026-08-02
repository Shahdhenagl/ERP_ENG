<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How hard a lead is worth chasing.
 *
 * The pipeline already says what stage a deal is at; it said nothing about
 * which of thirty leads at the same stage to ring first. Estimated value is a
 * poor proxy — a small order for a customer who buys every quarter outranks a
 * large one from somebody comparing prices.
 *
 * Defaults to normal, so nothing already recorded changes meaning.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('priority', 12)->default('normal')->after('status');
            $table->index(['status', 'priority']);
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['status', 'priority']);
            $table->dropColumn('priority');
        });
    }
};
