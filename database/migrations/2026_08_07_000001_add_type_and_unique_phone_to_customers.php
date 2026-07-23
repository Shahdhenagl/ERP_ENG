<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A kind for each customer, and a phone that belongs to one of them only.
 *
 * The type — factory, hospital, bank — is how a standby-power company thinks of
 * its accounts, so it earns a column to file and filter by. The phone becomes
 * unique because two records for one number are two versions of one customer,
 * and the day they disagree is the day a call goes to the wrong file.
 *
 * A won lead used to seed an empty phone with a dash placeholder; those are
 * cleared to NULL first, because a unique index tolerates many NULLs but not
 * two dashes.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Clear the old dash placeholder so it does not collide under the index.
        DB::table('customers')->where('phone', '—')->update(['phone' => null]);

        Schema::table('customers', function (Blueprint $table) {
            $table->string('type', 32)->nullable()->after('company')->index();
        });

        Schema::table('customers', function (Blueprint $table) {
            // A missing number is allowed; a shared one is not.
            $table->string('phone', 32)->nullable()->change();
            $table->unique('phone');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropUnique(['phone']);
            $table->dropColumn('type');
        });
    }
};
