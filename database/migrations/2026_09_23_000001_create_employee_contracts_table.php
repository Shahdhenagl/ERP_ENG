<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_contracts', function (Blueprint $table) {
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
        Schema::dropIfExists('employee_contracts');
    }
};
