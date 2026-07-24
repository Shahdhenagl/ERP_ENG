<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An internal sign-off before a quote goes to the customer.
 *
 * A salesperson drafts a quote and submits it; a manager approves it or sends
 * it back with a note. This is a gate before "sent", separate from the
 * customer's own later accept/reject — and optional, so the quick path
 * (draft → send) that already works is untouched. A quote nobody submitted
 * simply never enters the queue.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quotations', function (Blueprint $table) {
            $table->timestamp('submitted_at')->nullable()->after('status');
            $table->timestamp('approved_at')->nullable()->after('submitted_at');
            $table->foreignId('approved_by')->nullable()->after('approved_at')
                ->constrained('users')->nullOnDelete();
            $table->string('approval_note')->nullable()->after('approved_by');
        });
    }

    public function down(): void
    {
        Schema::table('quotations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('approved_by');
            $table->dropColumn(['submitted_at', 'approved_at', 'approval_note']);
        });
    }
};
