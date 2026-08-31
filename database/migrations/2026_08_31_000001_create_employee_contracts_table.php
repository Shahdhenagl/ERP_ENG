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
            $table->string('code', 40)->unique();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('title', 160);
            $table->enum('contract_type', ['full_time', 'part_time', 'fixed_term', 'indefinite', 'consultant'])
                ->default('full_time');
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->decimal('salary', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->enum('status', ['draft', 'active', 'expired', 'terminated'])->default('draft')->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['employee_id', 'status']);
            $table->index(['starts_on', 'ends_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_contracts');
    }
};
