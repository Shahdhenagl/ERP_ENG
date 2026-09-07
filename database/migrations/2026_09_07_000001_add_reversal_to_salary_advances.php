<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('salary_advances', function (Blueprint $table) {
            $table->timestamp('reversed_at')->nullable()->after('cash_movement_id');
            $table->foreignId('reversed_by')->nullable()->after('reversed_at')->constrained('users')->nullOnDelete();
            $table->foreignId('reversal_cash_movement_id')->nullable()->after('reversed_by')
                ->constrained('cash_movements')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('salary_advances', function (Blueprint $table) {
            $table->dropForeign(['reversal_cash_movement_id']);
            $table->dropForeign(['reversed_by']);
            $table->dropColumn(['reversed_at', 'reversed_by', 'reversal_cash_movement_id']);
        });
    }
};
