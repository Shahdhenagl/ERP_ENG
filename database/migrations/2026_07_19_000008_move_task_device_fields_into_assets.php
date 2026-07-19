<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Promotes the device_* text columns on `tasks` into real asset rows, then
 * drops them so there is one place a device's identity lives.
 *
 * Grouping rule: a serial identifies a unit outright. Rows without one are
 * grouped by customer + brand + model + capacity — imperfect, but it keeps
 * device history that would otherwise be dropped on the floor, and a human
 * can merge duplicates later. Nothing is deleted before it has been copied.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('tasks')
            ->whereNull('deleted_at')
            ->where(function ($q) {
                $q->whereNotNull('device_serial')
                    ->orWhereNotNull('device_brand')
                    ->orWhereNotNull('device_model')
                    ->orWhereNotNull('device_capacity');
            })
            ->get(['id', 'customer_id', 'device_brand', 'device_model', 'device_serial', 'device_capacity', 'site_address', 'site_lat', 'site_lng', 'completed_at', 'type']);

        $assetIdByKey = [];
        $next = (int) (DB::table('assets')->max('id') ?? 0);

        foreach ($rows as $row) {
            $serial = $this->clean($row->device_serial);
            $brand = $this->clean($row->device_brand);
            $model = $this->clean($row->device_model);
            $capacity = $this->clean($row->device_capacity);

            if (! $serial && ! $brand && ! $model && ! $capacity) {
                continue;
            }

            $key = $serial
                ? 'serial:'.mb_strtolower($serial)
                : implode('|', ['fuzzy', $row->customer_id, mb_strtolower((string) $brand), mb_strtolower((string) $model), mb_strtolower((string) $capacity)]);

            if (! isset($assetIdByKey[$key])) {
                $next++;

                $assetIdByKey[$key] = DB::table('assets')->insertGetId([
                    'code' => 'AS-'.str_pad((string) $next, 4, '0', STR_PAD_LEFT),
                    'serial' => $serial,
                    'customer_id' => $row->customer_id,
                    'brand' => $brand,
                    'model' => $model,
                    'capacity' => $capacity,
                    'site_address' => $row->site_address,
                    'site_lat' => $row->site_lat,
                    'site_lng' => $row->site_lng,
                    // An installation job that finished is the best evidence of
                    // an install date we have. Sale date is unknown — leaving it
                    // null keeps warranty "غير محدد" rather than inventing one.
                    'installed_at' => $row->type === 'installation' && $row->completed_at
                        ? substr((string) $row->completed_at, 0, 10)
                        : null,
                    'status' => 'active',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            DB::table('tasks')->where('id', $row->id)->update(['asset_id' => $assetIdByKey[$key]]);
        }

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['device_serial']);
            $table->dropColumn(['device_brand', 'device_model', 'device_serial', 'device_capacity']);
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('device_brand')->nullable();
            $table->string('device_model')->nullable();
            $table->string('device_serial')->nullable()->index();
            $table->string('device_capacity', 64)->nullable();
        });

        // Copy the identity back so a rollback is not a data loss event.
        DB::table('tasks')
            ->join('assets', 'tasks.asset_id', '=', 'assets.id')
            ->update([
                'tasks.device_brand' => DB::raw('assets.brand'),
                'tasks.device_model' => DB::raw('assets.model'),
                'tasks.device_serial' => DB::raw('assets.serial'),
                'tasks.device_capacity' => DB::raw('assets.capacity'),
            ]);
    }

    private function clean(?string $value): ?string
    {
        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }
};
