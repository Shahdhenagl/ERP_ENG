<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A ledger of operational alerts already raised.
 *
 * The daily sweep re-detects the same conditions every run — a warranty is
 * still expiring tomorrow, an invoice still overdue. A stable key per condition,
 * inserted once, is what stops the same alert landing in the manager's list
 * every morning until they act on it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alert_dispatches', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alert_dispatches');
    }
};
