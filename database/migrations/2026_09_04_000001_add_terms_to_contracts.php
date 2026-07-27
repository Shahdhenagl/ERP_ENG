<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The body of the contract as it is actually signed — the full Arabic text, kept
 * per contract so a particular customer's wording can be edited before it is
 * printed. Null until someone fills it; the form offers a template to start from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->longText('terms')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn('terms');
        });
    }
};
