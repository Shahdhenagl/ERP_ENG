<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * People, leave, advances and the monthly payroll.
 *
 * An employee is its own record, not a user. The company has drivers and
 * storekeepers who never log in, and a technician who does is one employee with
 * a login attached — so `user_id` is optional and points the other way. Tying
 * the two into one row would force everyone onto the login screen to be paid.
 *
 * Money only ever moves through the treasury and the ledger the rest of the
 * system already uses. An advance is a cash movement out; a paid payslip is a
 * cash movement out; nothing here writes a balance of its own. The payroll run
 * is the document, and its figures are re-derivable from the payslips under it
 * exactly as an invoice's total is re-derivable from its lines.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // EMP-0001

            // The login, when there is one. A field technician is the same
            // person in `users` and here; office-only staff have no user.
            $table->foreignId('user_id')->nullable()->unique()
                ->constrained()->nullOnDelete();

            $table->string('name', 160);
            $table->string('national_id', 32)->nullable();
            $table->string('phone', 32)->nullable();
            $table->string('job_title', 120)->nullable();
            $table->string('department', 120)->nullable();

            $table->date('hired_on');
            $table->date('left_on')->nullable();
            $table->enum('employment_type', ['full_time', 'part_time', 'contract'])
                ->default('full_time');

            // The pay structure. Basic plus named allowances, which is how a
            // payslip is read and how a raise is negotiated.
            $table->decimal('basic_salary', 12, 2)->default(0);
            $table->json('allowances')->nullable();             // [{name, amount}]

            // Statutory percentages, kept per employee because they are not the
            // same for everyone and change with the law.
            $table->decimal('insurance_rate', 5, 2)->default(0);
            $table->decimal('tax_rate', 5, 2)->default(0);

            // Days a year. Entitlement stays here; what is left is derived from
            // the approved leave, never stored, so it cannot drift.
            $table->unsignedSmallInteger('annual_leave_days')->default(21);

            // Where the salary is paid, when it is not cash in hand.
            $table->string('bank_name', 120)->nullable();
            $table->string('bank_account', 64)->nullable();

            $table->enum('status', ['active', 'suspended', 'terminated'])
                ->default('active')->index();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'department']);
        });

        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // LV-2026-0001
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();

            // Annual eats the balance; sick does not; unpaid deducts from pay.
            // The distinction is what makes the balance and the payslip correct.
            $table->enum('type', ['annual', 'sick', 'unpaid'])->default('annual');

            $table->date('from_date');
            $table->date('to_date');
            // Working days, computed on request and frozen — a public holiday
            // added later must not silently change what was approved.
            $table->unsignedSmallInteger('days');

            $table->enum('status', ['pending', 'approved', 'rejected', 'cancelled'])
                ->default('pending')->index();

            $table->text('reason')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_note')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['employee_id', 'type', 'status']);
        });

        Schema::create('salary_advances', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // AV-2026-0001
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();

            $table->date('advance_date');
            $table->decimal('amount', 12, 2);

            // How much comes off each payslip until it is cleared. The
            // outstanding balance is derived from what has been recovered, not
            // stored, so it cannot disagree with the payslips.
            $table->decimal('installment', 12, 2)->default(0);

            // The cash movement that handed the money over.
            $table->foreignId('cash_box_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('cash_movement_id')->nullable()
                ->constrained('cash_movements')->nullOnDelete();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index('employee_id');
        });

        Schema::create('payroll_runs', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // PR-2026-08

            // The month it pays. Unique, because two runs for one month is how
            // a salary gets paid twice.
            $table->unsignedSmallInteger('year');
            $table->unsignedTinyInteger('month');

            $table->enum('status', ['draft', 'approved', 'paid'])
                ->default('draft')->index();

            // Frozen when approved — the number of days the month's daily rate
            // divides by. Stored so a payslip can be recomputed identically.
            $table->unsignedTinyInteger('days_in_month')->default(30);

            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['year', 'month']);
        });

        Schema::create('payslips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_run_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();

            // Copied from the employee when the run is generated, so a raise
            // next month does not rewrite this month's slip.
            $table->decimal('basic_salary', 12, 2)->default(0);
            $table->decimal('allowances_total', 12, 2)->default(0);
            $table->json('allowances')->nullable();

            // Deductions, each on its own line because a payslip that only
            // shows the net is a payslip nobody trusts.
            $table->unsignedSmallInteger('unpaid_days')->default(0);
            $table->decimal('unpaid_deduction', 12, 2)->default(0);
            $table->decimal('advance_recovery', 12, 2)->default(0);
            $table->decimal('insurance', 12, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('other_deductions', 12, 2)->default(0);
            $table->string('other_note')->nullable();

            // Derived and stored on the slip so it prints without recomputation,
            // but every figure above adds up to these.
            $table->decimal('gross', 12, 2)->default(0);
            $table->decimal('total_deductions', 12, 2)->default(0);
            $table->decimal('net', 12, 2)->default(0);

            // Set when this slip is paid, tying it to the money that left.
            $table->foreignId('cash_box_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('cash_movement_id')->nullable()
                ->constrained('cash_movements')->nullOnDelete();
            $table->date('paid_on')->nullable();

            $table->timestamps();

            $table->unique(['payroll_run_id', 'employee_id']);
            $table->index('employee_id');
        });

        // Advancing money and paying a salary are both money out of a box, but
        // they answer to different accounts, so the treasury has to tell them
        // from a petty expense.
        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'expense', 'transfer', 'opening', 'supplier_payment',
                  'custody_advance', 'custody_settle', 'advance', 'payroll') NOT NULL",
        );

        // The journal groups by what raised the entry, and a payroll run is now
        // one of those things.
        DB::statement(
            "ALTER TABLE journal_entries MODIFY source
             ENUM('manual', 'invoice', 'payment', 'expense', 'transfer',
                  'supplier_invoice', 'supplier_payment', 'sales_return',
                  'custody', 'stock', 'opening', 'payroll')
             NOT NULL DEFAULT 'manual'",
        );
    }

    public function down(): void
    {
        DB::statement(
            "ALTER TABLE journal_entries MODIFY source
             ENUM('manual', 'invoice', 'payment', 'expense', 'transfer',
                  'supplier_invoice', 'supplier_payment', 'sales_return',
                  'custody', 'stock', 'opening')
             NOT NULL DEFAULT 'manual'",
        );

        DB::statement(
            "ALTER TABLE cash_movements MODIFY source
             ENUM('payment', 'expense', 'transfer', 'opening', 'supplier_payment',
                  'custody_advance', 'custody_settle') NOT NULL",
        );

        Schema::dropIfExists('payslips');
        Schema::dropIfExists('payroll_runs');
        Schema::dropIfExists('salary_advances');
        Schema::dropIfExists('leave_requests');
        Schema::dropIfExists('employees');
    }
};
