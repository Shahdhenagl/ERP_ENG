<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Customer sites. A bank is one customer with a branch in Maadi and another in
 * Nasr City; each holds its own devices and has its own contact.
 *
 * Until now the only way to model that was to register each branch as a
 * separate customer — which is why the seed data carries "بنك القاهرة — فرع
 * المعادي". That splits one account's receivables across several records.
 *
 * Every existing customer gets a branch built from the address already on
 * them, so nothing has to be re-entered and no task loses its destination.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();               // BR-0001
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();

            $table->string('name');
            // The customer's own reference for this site — they will quote it
            // when they ring, and they expect it back on the invoice.
            $table->string('customer_ref', 64)->nullable();

            $table->text('address')->nullable();
            $table->string('city')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->text('map_url')->nullable();

            // The technician deals with whoever is on site, not head office.
            $table->string('contact_name')->nullable();
            $table->string('contact_phone', 32)->nullable();
            $table->string('contact_whatsapp', 32)->nullable();

            // Kept as free text: "٩ص - ٥م، الجمعة مغلق" says more to a
            // dispatcher than a pair of times, and no rule reads it.
            $table->string('working_hours', 120)->nullable();

            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['customer_id', 'is_active']);
        });

        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('customer_id')
                ->constrained()->nullOnDelete();
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('customer_id')
                ->constrained()->nullOnDelete();
        });

        // ── Give every customer the branch they effectively already had ──
        $customers = DB::table('customers')
            ->whereNull('deleted_at')
            ->get(['id', 'name', 'address', 'city', 'lat', 'lng', 'map_url', 'phone', 'whatsapp']);

        $next = 0;

        foreach ($customers as $customer) {
            $next++;

            $branchId = DB::table('branches')->insertGetId([
                'code' => 'BR-'.str_pad((string) $next, 4, '0', STR_PAD_LEFT),
                'customer_id' => $customer->id,
                'name' => 'الفرع الرئيسي',
                'address' => $customer->address,
                'city' => $customer->city,
                'lat' => $customer->lat,
                'lng' => $customer->lng,
                'map_url' => $customer->map_url,
                'contact_phone' => $customer->phone,
                'contact_whatsapp' => $customer->whatsapp,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // Everything that belonged to the customer belonged to this site.
            DB::table('assets')->where('customer_id', $customer->id)->update(['branch_id' => $branchId]);
            DB::table('tasks')->where('customer_id', $customer->id)->update(['branch_id' => $branchId]);
        }
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('branch_id');
        });

        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('branch_id');
        });

        Schema::dropIfExists('branches');
    }
};
