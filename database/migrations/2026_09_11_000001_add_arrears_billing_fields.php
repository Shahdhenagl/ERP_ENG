<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->enum('collection_timing', ['upfront', 'arrears'])
                ->default('upfront')
                ->after('billing_frequency');
            $table->boolean('includes_spare_parts')
                ->default(false)
                ->after('collection_timing');
        });

        Schema::table('contract_payments', function (Blueprint $table) {
            $table->unsignedSmallInteger('service_year')->nullable()->after('sequence');
            $table->unsignedTinyInteger('period_number')->nullable()->after('service_year');
            $table->unsignedSmallInteger('service_from_visit_sequence')->nullable()->after('due_visit_sequence');
            $table->unsignedSmallInteger('service_to_visit_sequence')->nullable()->after('service_from_visit_sequence');
            $table->date('due_on')->nullable()->after('service_to_visit_sequence');
        });
    }

    public function down(): void
    {
        Schema::table('contract_payments', function (Blueprint $table) {
            $table->dropColumn([
                'service_year',
                'period_number',
                'service_from_visit_sequence',
                'service_to_visit_sequence',
                'due_on',
            ]);
        });

        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn(['collection_timing', 'includes_spare_parts']);
        });
    }
};
