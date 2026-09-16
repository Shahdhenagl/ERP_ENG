<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('suppliers', 'specialization')) {
            return;
        }

        Schema::table('suppliers', function (Blueprint $table): void {
            $table->string('specialization', 160)->nullable()->after('company');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('suppliers', 'specialization')) {
            return;
        }

        Schema::table('suppliers', function (Blueprint $table): void {
            $table->dropColumn('specialization');
        });
    }
};
