<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['purchase_order_lines', 'purchase_return_lines'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropForeign(['item_id']);
            });

            Schema::table($tableName, function (Blueprint $table) {
                $table->unsignedBigInteger('item_id')->nullable()->change();
                $table->foreign('item_id')->references('id')->on('items')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (['purchase_order_lines', 'purchase_return_lines'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropForeign(['item_id']);
            });

            Schema::table($tableName, function (Blueprint $table) {
                $table->unsignedBigInteger('item_id')->nullable(false)->change();
                $table->foreign('item_id')->references('id')->on('items');
            });
        }
    }
};
