<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Company details that appear on every printed document.
 *
 * A key/value table rather than a one-row `company` table: this will grow to
 * hold defaults nobody has asked for yet (VAT rate, payment terms, invoice
 * footer), and adding a row beats a migration each time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->string('key', 64)->primary();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
