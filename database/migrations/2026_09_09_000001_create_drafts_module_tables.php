<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('draft_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('name_en', 120)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique('name');
        });

        Schema::create('drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('draft_category_id')->constrained()->restrictOnDelete();
            $table->string('title', 200);
            $table->string('title_en', 200)->nullable();
            $table->longText('content')->nullable();
            $table->longText('content_en')->nullable();
            $table->decimal('font_size', 4, 1)->default(14);
            $table->string('font_family', 80)->default('Cairo');
            $table->string('text_color', 16)->default('#0b1b3a');
            $table->string('accent_color', 16)->default('#0f766e');
            $table->enum('direction', ['rtl', 'ltr'])->default('rtl');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['draft_category_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drafts');
        Schema::dropIfExists('draft_categories');
    }
};
