<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['is_active', 'name']);
        });

        Schema::create('workflow_template_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_template_id')->constrained('workflow_templates')->cascadeOnDelete();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_required')->default(true);
            $table->timestamps();
            $table->index(['workflow_template_id', 'sort_order'], 'wt_steps_order_idx');
        });

        Schema::create('installment_workflows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contract_payment_id')->unique()->constrained('contract_payments')->cascadeOnDelete();
            $table->foreignId('workflow_template_id')->constrained('workflow_templates')->restrictOnDelete();
            $table->string('status', 24)->default('pending');
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['status', 'completed_at'], 'installment_workflow_status_idx');
        });

        Schema::create('workflow_step_completions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('installment_workflow_id')->constrained('installment_workflows')->cascadeOnDelete();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_required')->default(true);
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['installment_workflow_id', 'sort_order'], 'iw_steps_order_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_step_completions');
        Schema::dropIfExists('installment_workflows');
        Schema::dropIfExists('workflow_template_steps');
        Schema::dropIfExists('workflow_templates');
    }
};

