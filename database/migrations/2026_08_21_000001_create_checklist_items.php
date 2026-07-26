<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The fixed periodic-maintenance checklist.
 *
 * One list the manager maintains — the points a technician must check on every
 * routine visit. It is a template, not a record: the technician's answers for a
 * given visit are snapshotted onto that visit's report, so editing the list
 * later never rewrites what was already inspected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('checklist_items', function (Blueprint $table) {
            $table->id();
            $table->string('label', 200);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::table('task_reports', function (Blueprint $table) {
            // [{label, status: ok|issue|na, note}] — a snapshot of the answers.
            $table->json('ppm_checklist')->nullable()->after('check_accessories');
        });
    }

    public function down(): void
    {
        Schema::table('task_reports', function (Blueprint $table) {
            $table->dropColumn('ppm_checklist');
        });

        Schema::dropIfExists('checklist_items');
    }
};
