<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Item categories as records rather than three values fixed in the code.
 *
 * Batteries, spare parts and consumables covered the first month and stopped
 * being enough the moment anyone wanted to separate inverter cards from
 * cooling fans. Adding a fourth meant a code change and a deploy, which is not
 * a reasonable price for a word.
 *
 * The existing `category` column stays and keeps working. Every item is given
 * the matching record here, and the two are kept in step by the controller —
 * the column is what the old reports and the seeded data read, and dropping it
 * in the same migration that copies it out would leave no way to check the move
 * went right. It can go once nothing reads it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            // Kept for the three that were hard-coded, so a report filtering on
            // `battery` keeps finding the batteries.
            $table->string('slug', 64)->nullable()->unique();
            $table->string('colour', 32)->nullable();
            $table->unsignedSmallInteger('sort')->default(0);
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::table('items', function (Blueprint $table) {
            $table->foreignId('item_category_id')->nullable()->after('category')
                ->constrained()->nullOnDelete();
        });

        // Promote the three that were in the enum, and point every item at its
        // own. Written here rather than in a seeder because an install that
        // never runs the seeder still has items to move.
        $seeded = [
            ['battery', 'بطاريات', 'amber', 1],
            ['spare_part', 'قطع غيار', 'blue', 2],
            ['consumable', 'مستهلكات', 'slate', 3],
        ];

        foreach ($seeded as [$slug, $name, $colour, $sort]) {
            $id = DB::table('item_categories')->insertGetId([
                'name' => $name,
                'slug' => $slug,
                'colour' => $colour,
                'sort' => $sort,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('items')->where('category', $slug)->update(['item_category_id' => $id]);
        }
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('item_category_id');
        });

        Schema::dropIfExists('item_categories');
    }
};
