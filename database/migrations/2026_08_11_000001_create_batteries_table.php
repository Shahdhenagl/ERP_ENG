<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The batteries inside the UPS units, and when each is due to be changed.
 *
 * A UPS is only as good as the battery bank behind it, and that bank has a
 * shelf life the device does not — so it is tracked on its own. Each record is
 * one bank in one unit, installed on a date with an expected life; the due date
 * is that date plus the life, derived and never stored, so extending the life
 * moves it and nothing goes stale.
 *
 * Replacing a bank does not edit this row — it closes it and opens a new one,
 * linked back, so the unit keeps a history of every bank it has worn out rather
 * than only its current one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batteries', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // BT-0001

            // The unit it powers, and the customer that owns it — the customer
            // is copied from the asset so a due-soon report can be read by
            // account without a join through the device.
            $table->foreignId('asset_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();

            $table->string('serial_number', 120)->nullable();
            $table->string('brand', 120)->nullable();
            $table->string('model', 120)->nullable();
            $table->decimal('capacity_ah', 8, 2)->nullable();   // amp-hours
            $table->decimal('voltage', 8, 2)->nullable();
            $table->unsignedSmallInteger('count')->default(1);  // cells in the bank

            $table->date('installed_on');
            // Months of expected service — the due date is installed_on plus this.
            $table->unsignedSmallInteger('life_months')->default(24);
            $table->unsignedSmallInteger('warranty_months')->nullable();

            $table->enum('status', ['active', 'replaced', 'faulty'])
                ->default('active')->index();

            // The bank that took over, set when this one is replaced.
            $table->foreignId('replaced_by_id')->nullable()
                ->constrained('batteries')->nullOnDelete();
            $table->date('replaced_on')->nullable();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'installed_on']);
            $table->index('asset_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batteries');
    }
};
