<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Files hung off any record — site-survey photos, a tender's documents, a
 * battery's label — through one polymorphic table rather than a column per
 * module. The bytes live on the public disk; this keeps only where each file
 * came from and what it is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            // attachable_type + attachable_id — the record it belongs to.
            $table->morphs('attachable');

            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            $table->string('path');                 // on the public disk
            $table->string('original_name');
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->string('caption', 500)->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
    }
};
