<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The site visit that comes before a quote.
 *
 * A standby-power quote is only as good as what the engineer saw on site: the
 * load to cover, the phases, how long it must ride through, and what is already
 * installed. This records that visit as its own document, tied to the
 * opportunity it prices, so the numbers a quotation is built on are the numbers
 * someone actually measured — and an approved survey is the frozen basis the
 * quote answers to.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_surveys', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // SV-2026-0001

            // The opportunity it prices, and the account it belongs to. Either
            // can stand alone — a survey for a walk-in has no lead yet.
            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();

            $table->foreignId('surveyed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('survey_date');

            $table->enum('status', ['draft', 'completed', 'approved'])
                ->default('draft')->index();

            $table->string('contact_name', 160)->nullable();
            $table->string('contact_phone', 32)->nullable();
            $table->string('address', 500)->nullable();
            $table->string('city', 80)->nullable();

            // The technical shape of the requirement.
            $table->decimal('load_kva', 10, 2)->nullable();     // load to cover
            $table->enum('phase', ['single', 'three'])->nullable();
            $table->unsignedSmallInteger('backup_minutes')->nullable(); // autonomy needed

            $table->text('existing_equipment')->nullable();     // what is on site now
            $table->text('recommendation')->nullable();         // the engineer's proposal
            $table->text('notes')->nullable();

            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'survey_date']);
            $table->index('lead_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_surveys');
    }
};
