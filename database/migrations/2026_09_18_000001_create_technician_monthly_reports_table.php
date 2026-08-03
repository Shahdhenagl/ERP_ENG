<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The monthly report a technician hands in, and who took it from them.
 *
 * A record of a handover, nothing more. It moves no money, settles no custody
 * and touches no payslip — the same month can be signed off here and still owe
 * everything it owed before. What it answers is the question asked at the start
 * of every month: which technicians have handed theirs in, and to whom.
 *
 * One row per technician per month, so signing the same month twice corrects
 * the record rather than adding a second one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('technician_monthly_reports', function (Blueprint $table) {
            $table->id();

            $table->foreignId('technician_id')->constrained('users')->cascadeOnDelete();
            // The month it covers, as YYYY-MM. Stored as text because that is
            // what it is — a month, not a day inside one.
            $table->string('period', 7);

            // Who took delivery of it. A name on a record, not an authority:
            // whoever received the paperwork.
            $table->foreignId('received_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('received_on')->nullable();
            $table->text('notes')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['technician_id', 'period']);
            $table->index('period');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('technician_monthly_reports');
    }
};
