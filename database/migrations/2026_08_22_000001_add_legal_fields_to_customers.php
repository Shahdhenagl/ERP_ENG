<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The details an invoice and a contract need from a customer: the English name
 * that appears beside the Arabic on formal paper, and the two numbers the tax
 * authority asks for — the tax card and the commercial registry.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('name_en')->nullable()->after('name');
            $table->string('tax_id', 32)->nullable()->after('email');
            $table->string('commercial_register', 32)->nullable()->after('tax_id');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['name_en', 'tax_id', 'commercial_register']);
        });
    }
};
