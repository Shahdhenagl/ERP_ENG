<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A photo of the receipt behind a custody expense.
 *
 * A technician spending out of their float photographs what they paid for; the
 * image lives beside the movement so a manager reviewing the account can see
 * the paper behind every figure, not just the number.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->string('receipt_path')->nullable()->after('note');
        });
    }

    public function down(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->dropColumn('receipt_path');
        });
    }
};
