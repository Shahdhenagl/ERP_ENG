<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which site the bank stands at.
 *
 * A battery already knew its customer and the UPS it feeds; a customer with
 * thirty branches makes "whose" far too coarse an answer for a technician being
 * sent to replace one.
 *
 * Backfilled from the device where there is one, since that device already
 * carries the site, and a bank does not stand somewhere its UPS does not.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('batteries', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('customer_id')
                ->constrained()->nullOnDelete();
        });

        \Illuminate\Support\Facades\DB::statement(
            'update batteries
             join assets on assets.id = batteries.asset_id
             set batteries.branch_id = assets.branch_id
             where batteries.asset_id is not null and assets.branch_id is not null',
        );
    }

    public function down(): void
    {
        Schema::table('batteries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('branch_id');
        });
    }
};
