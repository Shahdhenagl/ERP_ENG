<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use App\Models\UserPermission;
use App\Services\PermissionRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PermissionController extends Controller
{
    /** The catalogue, and what each role gets without being told. */
    public function index(): JsonResponse
    {
        return response()->json([
            'groups' => PermissionRegistry::grouped(),
            'defaults' => collect(UserRole::cases())
                ->mapWithKeys(fn (UserRole $role) => [
                    $role->value => PermissionRegistry::defaultsFor($role),
                ]),
        ]);
    }

    /**
     * What one user may do, and where each answer came from.
     *
     * All three are sent — what the role gives, what was overridden, and the
     * result — because a screen showing only the result cannot say whether a
     * tick is inherited or was set deliberately, and an administrator needs
     * to know which they are changing.
     */
    public function show(User $user): JsonResponse
    {
        return response()->json([
            'user' => ['id' => $user->id, 'name' => $user->name, 'role' => $user->role->value],
            'defaults' => PermissionRegistry::defaultsFor($user->role),
            'overrides' => $user->permissionOverrides()
                ->pluck('granted', 'permission')
                ->map(fn ($granted) => (bool) $granted),
            'effective' => $user->permissions(),
        ]);
    }

    /**
     * Set a user's departures from their role.
     *
     * A value equal to the role's default clears the row rather than storing
     * it: a stored override that says what the role already says is a lie
     * waiting to happen, because changing the role later would leave it behind
     * saying the old thing.
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'permissions' => ['present', 'array'],
        ]);

        foreach (array_keys($data['permissions']) as $permission) {
            if (! PermissionRegistry::exists($permission)) {
                throw ValidationException::withMessages([
                    'permissions' => "الصلاحية «{$permission}» غير معروفة.",
                ]);
            }
        }

        $defaults = PermissionRegistry::defaultsFor($user->role);

        DB::transaction(function () use ($data, $user, $defaults, $request) {
            foreach ($data['permissions'] as $permission => $granted) {
                $granted = (bool) $granted;
                $isDefault = in_array($permission, $defaults, true);

                if ($granted === $isDefault) {
                    UserPermission::where('user_id', $user->id)
                        ->where('permission', $permission)
                        ->delete();

                    continue;
                }

                UserPermission::updateOrCreate(
                    ['user_id' => $user->id, 'permission' => $permission],
                    ['granted' => $granted, 'granted_by' => $request->user()->id],
                );
            }
        });

        $user->refresh();

        ActivityLog::record(
            'user.permissions',
            $user,
            "تعديل صلاحيات {$user->name}",
            ['overrides' => $user->permissionOverrides()->pluck('granted', 'permission')],
        );

        return response()->json([
            'defaults' => $defaults,
            'overrides' => $user->permissionOverrides()
                ->pluck('granted', 'permission')
                ->map(fn ($granted) => (bool) $granted),
            'effective' => $user->permissions(),
        ]);
    }
}
