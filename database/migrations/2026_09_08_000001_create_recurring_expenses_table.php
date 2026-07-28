<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The bills that come round on their own — rent, an internet line, a licence —
 * kept as a template with a cycle so the till knows they are coming. Each has a
 * next due date the reminder watches and paying advances by one cycle, so the
 * schedule holds steady rather than drifting by however late a payment was.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recurring_expenses', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->decimal('amount', 14, 2)->default(0);
            $table->string('category', 120)->nullable();
            // The box it is paid from; null means the main till at pay time.
            $table->foreignId('cash_box_id')->nullable()->constrained()->nullOnDelete();
            // The period between dues, in days: 30, 60, a year — a plain number
            // so an odd cycle needs no special case.
            $table->unsignedSmallInteger('cycle_days')->default(30);
            $table->date('start_on');
            $table->date('next_due_on');
            $table->date('last_paid_on')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['is_active', 'next_due_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recurring_expenses');
    }
};
