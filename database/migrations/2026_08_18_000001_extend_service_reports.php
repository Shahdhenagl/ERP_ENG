<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bring the digital service report in line with the paper one it replaces.
 *
 * Three things the paper had and the record did not: the mains voltage read per
 * phase (the sheet writes three numbers, not one), a short site-inspection
 * checklist (earthing, environment, charger, accessories — each just ticked),
 * and a report number the customer can quote back. The existing single voltage
 * columns become phase L1, so nothing already filed changes meaning.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_reports', function (Blueprint $table) {
            // The existing input_voltage / output_voltage stay as phase L1; L2/L3
            // are added for the three-phase units the paper reports on.
            $table->decimal('input_voltage_l2', 8, 2)->nullable()->after('input_voltage');
            $table->decimal('input_voltage_l3', 8, 2)->nullable()->after('input_voltage_l2');
            $table->decimal('output_voltage_l2', 8, 2)->nullable()->after('output_voltage');
            $table->decimal('output_voltage_l3', 8, 2)->nullable()->after('output_voltage_l2');

            // Site inspection — each item is a quick verdict, not a measurement.
            foreach (['earthing', 'environment', 'charger', 'accessories'] as $check) {
                $table->enum("check_{$check}", ['ok', 'issue', 'na'])
                    ->nullable()
                    ->after('batteries_need_replacement');
            }
        });

        Schema::table('tasks', function (Blueprint $table) {
            // One number per visit — the "No. 07720" on the paper. Assigned when
            // the first report of the visit is filed, never reused.
            $table->string('service_report_no')->nullable()->unique()->after('code');
        });
    }

    public function down(): void
    {
        Schema::table('task_reports', function (Blueprint $table) {
            $table->dropColumn([
                'input_voltage_l2', 'input_voltage_l3',
                'output_voltage_l2', 'output_voltage_l3',
                'check_earthing', 'check_environment', 'check_charger', 'check_accessories',
            ]);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropUnique(['service_report_no']);
            $table->dropColumn('service_report_no');
        });
    }
};
