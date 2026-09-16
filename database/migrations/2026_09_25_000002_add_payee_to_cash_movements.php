<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('cash_movements', 'supplier_id')) {
            Schema::table('cash_movements', function (Blueprint $table): void {
                $table->foreignId('supplier_id')->nullable()->after('supplier_payment_id')->constrained('suppliers')->nullOnDelete();
            });
        }
        if (! Schema::hasColumn('cash_movements', 'payee_name')) {
            Schema::table('cash_movements', function (Blueprint $table): void {
                $table->string('payee_name', 160)->nullable()->after('supplier_id');
                $table->index('payee_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('cash_movements', 'supplier_id')) {
            Schema::table('cash_movements', function (Blueprint $table): void {
                $table->dropForeign(['supplier_id']);
                $table->dropColumn('supplier_id');
            });
        }
        if (Schema::hasColumn('cash_movements', 'payee_name')) {
            Schema::table('cash_movements', function (Blueprint $table): void {
                $table->dropColumn('payee_name');
            });
        }
    }
};
