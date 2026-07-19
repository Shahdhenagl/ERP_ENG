<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The serialized asset registry — the device as a first-class entity rather
 * than four loose text columns repeated on every task.
 *
 * Batteries are deliberately NOT modelled here: the business tracks them as
 * stock items, not as serialized sub-assets. What a job did to the batteries
 * stays on the task report.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assets', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // AS-0001

            // The serial is the real-world identity, but it is not always known
            // at the moment a device is registered — so it is unique when
            // present rather than required.
            $table->string('serial')->nullable()->unique();

            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();

            $table->string('brand')->nullable();
            $table->string('model')->nullable();
            $table->string('capacity', 64)->nullable();         // e.g. "10 kVA"

            // Where the device physically sits — defaults from the customer but
            // a customer can have devices in several buildings.
            $table->text('site_address')->nullable();
            $table->decimal('site_lat', 10, 7)->nullable();
            $table->decimal('site_lng', 10, 7)->nullable();

            // Warranty runs from the sale date — the company's rule.
            $table->date('sold_at')->nullable();
            $table->unsignedSmallInteger('warranty_months')->nullable();
            $table->date('installed_at')->nullable();

            $table->enum('status', [
                'active',       // in service
                'under_repair',
                'retired',      // decommissioned
            ])->default('active')->index();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['customer_id', 'status']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            // Nullable on purpose: a repair call can be logged before anyone
            // knows which unit it is about.
            $table->foreignId('asset_id')->nullable()->after('customer_id')
                ->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('asset_id');
        });

        Schema::dropIfExists('assets');
    }
};
