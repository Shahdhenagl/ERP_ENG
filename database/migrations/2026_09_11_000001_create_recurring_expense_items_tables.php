<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The reusable, selectable items shown under each recurring expense. A small
 * pivot table keeps one item available to many expenses without duplicating
 * labels or limiting a bill to a single item.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recurring_expense_items', function (Blueprint $table) {
            $table->id();
            $table->string('label', 120)->unique();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('recurring_expense_item_links', function (Blueprint $table) {
            $table->foreignId('recurring_expense_id')->constrained()->cascadeOnDelete();
            $table->foreignId('recurring_expense_item_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->primary(['recurring_expense_id', 'recurring_expense_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recurring_expense_item_links');
        Schema::dropIfExists('recurring_expense_items');
    }
};
