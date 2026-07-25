<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Deductions and bonuses that land on a month's payslip.
 *
 * Separate from an advance (a loan recovered over months) and from the
 * statutory lines the slip already computes: this is the one-off penalty or
 * incentive an operator adds for a given month. Each is stamped with the month
 * it belongs to, and the payslip for that month folds the bonuses into pay and
 * the deductions into what is withheld — so the register and the slip can never
 * disagree.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();

            $table->enum('type', ['deduction', 'bonus']);
            $table->decimal('amount', 12, 2);
            $table->string('reason', 300)->nullable();

            // The month it applies to — the slip for this month picks it up.
            $table->unsignedSmallInteger('year');
            $table->unsignedTinyInteger('month');

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['employee_id', 'year', 'month']);
        });

        // Bonuses need a home on the slip beside the deductions it already has;
        // default zero so every existing slip's net stays exactly what it was.
        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('additions_total', 12, 2)->default(0)->after('allowances_total');
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn('additions_total');
        });

        Schema::dropIfExists('payroll_adjustments');
    }
};
