<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds day-based payroll without rewriting a single historical amount.
 * Existing slips only receive descriptive day snapshots matching the rules
 * they were originally calculated with; gross, deductions and net stay intact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->unsignedTinyInteger('salary_basis_days')->default(30)->after('basic_salary');
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->unsignedTinyInteger('salary_basis_days')->default(30)->after('basic_salary');
            $table->decimal('worked_days', 5, 2)->default(30)->after('salary_basis_days');
            $table->decimal('insurance_rate', 5, 2)->default(0)->after('worked_days');
            $table->decimal('tax_rate', 5, 2)->default(0)->after('insurance_rate');
        });

        // Descriptive backfill only. Historical money columns are deliberately
        // untouched, so a live ledger cannot move during deployment.
        DB::table('payslips')->orderBy('id')->each(function (object $slip): void {
            $run = DB::table('payroll_runs')->where('id', $slip->payroll_run_id)->first();
            $basis = max(1, (int) ($run?->days_in_month ?? 30));

            DB::table('payslips')->where('id', $slip->id)->update([
                'salary_basis_days' => $basis,
                'worked_days' => max(0, $basis - (int) $slip->unpaid_days),
                'insurance_rate' => (float) $slip->gross > 0
                    ? round((float) $slip->insurance / (float) $slip->gross * 100, 2)
                    : 0,
                'tax_rate' => ((float) $slip->gross - (float) $slip->insurance) > 0
                    ? round((float) $slip->tax / ((float) $slip->gross - (float) $slip->insurance) * 100, 2)
                    : 0,
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn(['salary_basis_days', 'worked_days', 'insurance_rate', 'tax_rate']);
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('salary_basis_days');
        });
    }
};
