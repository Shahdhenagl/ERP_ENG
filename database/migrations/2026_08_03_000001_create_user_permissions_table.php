<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user departures from what the role allows.
 *
 * Only the differences are stored. A manager with no rows here can do exactly
 * what every manager could do before this table existed, which is what makes
 * the change safe to ship: access moves for nobody until somebody moves it.
 *
 * `granted` carries both directions on purpose. A row can add a permission the
 * role does not have — a storekeeper who may also read the accounts — or take
 * one away that it does — a manager kept out of the treasury. Two tables, one
 * for grants and one for revokes, would let the same permission appear in both
 * and leave the answer to whichever query ran first.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Validated against PermissionRegistry rather than a foreign key:
            // the catalogue lives in code because a permission no route checks
            // is a promise the system does not keep.
            $table->string('permission', 64);

            $table->boolean('granted');

            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // One answer per user per permission.
            $table->unique(['user_id', 'permission']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_permissions');
    }
};
