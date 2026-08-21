<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The old unique index is also the only supporting index for the
        // technician foreign key. Add a replacement before removing it.
        Schema::table('technician_monthly_reports', function (Blueprint $table) {
            $table->index('technician_id');
        });

        Schema::table('technician_monthly_reports', function (Blueprint $table) {
            $table->dropUnique('technician_monthly_reports_technician_id_period_unique');

            $table->foreignId('customer_id')
                ->nullable()
                ->after('period')
                ->constrained('customers')
                ->nullOnDelete();

            $table->foreignId('branch_id')
                ->nullable()
                ->after('customer_id')
                ->constrained('branches')
                ->nullOnDelete();

            $table->index(['technician_id', 'period']);
            $table->index(['customer_id', 'branch_id']);
        });
    }

    public function down(): void
    {
        Schema::table('technician_monthly_reports', function (Blueprint $table) {
            $table->dropIndex(['technician_id', 'period']);
            $table->dropIndex(['customer_id', 'branch_id']);
            $table->dropConstrainedForeignId('branch_id');
            $table->dropConstrainedForeignId('customer_id');
            $table->unique(['technician_id', 'period']);
        });

        Schema::table('technician_monthly_reports', function (Blueprint $table) {
            $table->dropIndex('technician_monthly_reports_technician_id_index');
        });
    }
};
