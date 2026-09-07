<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Upgrade installations that already created this table from the
        // earlier employee-contracts migration without dropping live records.
        if (Schema::hasTable('employee_contracts')) {
            if (! Schema::hasColumn('employee_contracts', 'type')) {
                Schema::table('employee_contracts', function (Blueprint $table): void {
                    $table->enum('type', ['permanent', 'fixed_term', 'temporary', 'probation'])
                        ->default('fixed_term')
                        ->after('title');
                });
            }

            if (! Schema::hasColumn('employee_contracts', 'agreed_salary')) {
                Schema::table('employee_contracts', function (Blueprint $table): void {
                    $table->decimal('agreed_salary', 12, 2)->default(0)->after('ends_on');
                });
            }

            if (! Schema::hasColumn('employee_contracts', 'salary_basis_days')) {
                Schema::table('employee_contracts', function (Blueprint $table): void {
                    $table->unsignedTinyInteger('salary_basis_days')->default(30)->after('agreed_salary');
                });
            }

            if (Schema::hasColumn('employee_contracts', 'contract_type')) {
                DB::statement("UPDATE employee_contracts SET type = CASE contract_type
                    WHEN 'indefinite' THEN 'permanent'
                    WHEN 'consultant' THEN 'temporary'
                    WHEN 'part_time' THEN 'temporary'
                    WHEN 'full_time' THEN 'permanent'
                    ELSE 'fixed_term'
                END WHERE contract_type IS NOT NULL");
            }

            if (Schema::hasColumn('employee_contracts', 'salary')) {
                DB::statement('UPDATE employee_contracts SET agreed_salary = salary');
            }

            return;
        }

        Schema::create('employee_contracts', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 32)->unique();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('title', 160)->default('عقد عمل');
            $table->enum('type', ['permanent', 'fixed_term', 'temporary', 'probation'])->default('fixed_term');
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->decimal('agreed_salary', 12, 2)->default(0);
            $table->unsignedTinyInteger('salary_basis_days')->default(30);
            $table->enum('status', ['active', 'expired', 'terminated'])->default('active')->index();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['employee_id', 'starts_on']);
        });
    }

    public function down(): void
    {
        // Keep the pre-existing table and its live records on rollback.
        if (! Schema::hasTable('employee_contracts')) {
            return;
        }

        foreach (['salary_basis_days', 'agreed_salary', 'type'] as $column) {
            if (Schema::hasColumn('employee_contracts', $column)) {
                Schema::table('employee_contracts', function (Blueprint $table) use ($column): void {
                    $table->dropColumn($column);
                });
            }
        }
    }
};
