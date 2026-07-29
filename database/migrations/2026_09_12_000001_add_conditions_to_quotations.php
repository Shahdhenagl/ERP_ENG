<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The standing conditions a quotation closes with — prices, delivery period,
 * payment terms, warranty, validity.
 *
 * Label/value pairs rather than a paragraph, because that is how the sheet is
 * read: a customer looks down the right-hand column for "الضمان" and across.
 * `terms` stays for anything that needs saying in prose beside them.
 *
 * Nullable: a quote with none falls back to the company-wide set in settings,
 * which is what makes them "standing" conditions rather than five fields to
 * retype on every offer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quotations', function (Blueprint $table) {
            $table->json('conditions')->nullable()->after('terms');
        });
    }

    public function down(): void
    {
        Schema::table('quotations', function (Blueprint $table) {
            $table->dropColumn('conditions');
        });
    }
};
