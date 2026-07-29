<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who the expense was for.
 *
 * Distinct from `created_by`, which is whoever sat at the screen. "Who spent
 * this" and "who typed it in" are the same person often enough to be confused
 * and different often enough to matter — a manager records fuel for a
 * technician, and the question later is whose fuel it was.
 *
 * nullOnDelete: removing a user must not take the voucher with them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->foreignId('responsible_user_id')->nullable()->after('user_id')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('cash_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('responsible_user_id');
        });
    }
};
