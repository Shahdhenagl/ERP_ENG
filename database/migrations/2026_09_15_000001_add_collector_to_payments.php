<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who actually took the money, as opposed to who typed the receipt.
 *
 * `user_id` has always been the account that recorded the payment, and for a
 * collection made at a desk they are the same person. They are not the same
 * person when a technician collects an instalment on site and the office
 * enters it that evening — and it is precisely then that somebody needs to be
 * named, because until the cash reaches a drawer it is in a pocket.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('collected_by_user_id')->nullable()->after('user_id')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('collected_by_user_id');
        });
    }
};
