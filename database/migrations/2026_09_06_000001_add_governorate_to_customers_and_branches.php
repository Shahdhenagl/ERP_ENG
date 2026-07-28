<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An address is picked from a library now — a governorate, then its district —
 * so it needs a home for the governorate beside the district that `city` has
 * always held. Nullable, because every record entered before this had only the
 * free-text city and keeps it untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('governorate', 60)->nullable()->after('address');
        });

        Schema::table('branches', function (Blueprint $table) {
            $table->string('governorate', 60)->nullable()->after('address');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('governorate');
        });

        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('governorate');
        });
    }
};
