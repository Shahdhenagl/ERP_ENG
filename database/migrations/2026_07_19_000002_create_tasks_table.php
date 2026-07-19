<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();           // WO-2026-0001

            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->string('title');
            $table->text('description')->nullable();

            $table->enum('type', ['installation', 'maintenance', 'repair', 'inspection', 'delivery'])
                ->default('maintenance')->index();
            $table->enum('priority', ['low', 'normal', 'high', 'urgent'])
                ->default('normal')->index();
            $table->enum('status', [
                'pending',      // created, waiting for the technician to accept
                'accepted',     // technician acknowledged
                'on_the_way',   // travelling to site
                'in_progress',  // working on site
                'completed',    // finished + report filed
                'cancelled',
            ])->default('pending')->index();

            // Site snapshot — defaults from the customer but may differ per job.
            $table->text('site_address')->nullable();
            $table->decimal('site_lat', 10, 7)->nullable();
            $table->decimal('site_lng', 10, 7)->nullable();
            $table->text('site_map_url')->nullable();

            // UPS asset stub — grows into the full serialized asset registry later.
            $table->string('device_brand')->nullable();
            $table->string('device_model')->nullable();
            $table->string('device_serial')->nullable()->index();
            $table->string('device_capacity', 64)->nullable();   // e.g. "10 kVA"

            $table->timestamp('scheduled_at')->nullable()->index();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('on_the_way_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->text('cancel_reason')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'assigned_to']);
            $table->index(['status', 'scheduled_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
