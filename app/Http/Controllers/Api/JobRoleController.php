<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\JobRole;
use App\Models\User;
use App\Services\PermissionRegistry;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Roles an administrator writes: a name, an application, and a set of ticks.
 *
 * The permissions on offer come from the catalogue in code, and anything not
 * in it is rejected — a role granting a permission no route checks would read
 * as a restriction that was never applied.
 */
class JobRoleController extends Controller
{
    public function index(): JsonResponse
    {
        $counts = User::query()
            ->whereNotNull('position')
            ->selectRaw('position, count(*) as total')
            ->groupBy('position')
            ->pluck('total', 'position');

        return response()->json([
            'roles' => JobRole::query()->orderBy('sort')->get()->map(fn (JobRole $role) => [
                'id' => $role->id,
                'key' => $role->key,
                'name' => $role->name,
                'base_role' => $role->base_role,
                'base_role_label' => JobRole::roleFor($role->key)->label(),
                'permissions' => JobRole::permissionsFor($role->key),
                'users_count' => (int) ($counts[$role->key] ?? 0),
            ]),
            'groups' => PermissionRegistry::grouped(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        // The key is what accounts store, so it is issued once and never
        // touched again — renaming a role must not orphan its users. An Arabic
        // name slugs to nothing, hence the fallback.
        $key = Str::slug($data['name'], '_') ?: 'role_'.Str::lower(Str::random(6));

        while (JobRole::query()->where('key', $key)->exists()) {
            $key = Str::limit($key, 30, '').'_'.Str::lower(Str::random(4));
        }

        $role = JobRole::create([
            'key' => $key,
            'name' => $data['name'],
            'base_role' => $data['base_role'],
            'permissions' => $data['permissions'],
            'sort' => ((int) JobRole::query()->max('sort')) + 10,
        ]);

        ActivityLog::record('job_role.created', $role, "تم إنشاء الدور {$role->name}");

        return response()->json($role, 201);
    }

    public function update(Request $request, JobRole $jobRole): JsonResponse
    {
        $data = $this->validated($request, $jobRole);

        $jobRole->update([
            'name' => $data['name'],
            'base_role' => $data['base_role'],
            'permissions' => $data['permissions'],
        ]);

        // Everyone holding it moves with it, which is the point of a role. The
        // per-user exceptions stay: they were set against this role knowingly.
        User::query()->where('position', $jobRole->key)->update(['role' => $jobRole->base_role]);

        ActivityLog::record('job_role.updated', $jobRole, "تم تعديل الدور {$jobRole->name}");

        return response()->json($jobRole->fresh());
    }

    public function destroy(JobRole $jobRole): JsonResponse
    {
        $holders = User::query()->where('position', $jobRole->key)->count();

        if ($holders > 0) {
            return response()->json([
                'message' => "لا يمكن حذف دور مسند إلى {$holders} مستخدم. غيّر دورهم أولاً.",
            ], 422);
        }

        $name = $jobRole->name;
        $jobRole->delete();

        ActivityLog::record('job_role.deleted', null, "تم حذف الدور {$name}");

        return response()->json(['message' => Terms::get('تم حذف الدور.')]);
    }

    /** @return array{name: string, base_role: string, permissions: array<int, string>} */
    protected function validated(Request $request, ?JobRole $existing = null): array
    {
        $data = $request->validate([
            'name' => [
                'required', 'string', 'max:80',
                Rule::unique('job_roles', 'name')->ignore($existing?->id),
            ],
            'base_role' => ['required', Rule::enum(UserRole::class)],
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', Rule::in(PermissionRegistry::keys())],
        ], [
            'permissions.*.in' => 'صلاحية غير معروفة.',
            'name.unique' => 'يوجد دور بهذا الاسم بالفعل.',
        ]);

        $data['permissions'] = array_values(array_unique($data['permissions']));

        return $data;
    }
}
