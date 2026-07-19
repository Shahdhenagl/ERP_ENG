<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $users = User::query()
            ->when($request->string('role')->toString(), fn ($q, $role) => $q->where('role', $role))
            ->when($request->string('search')->toString(), function ($q, $term) {
                $q->where(function ($sub) use ($term) {
                    $sub->where('name', 'like', "%{$term}%")
                        ->orWhere('email', 'like', "%{$term}%")
                        ->orWhere('phone', 'like', "%{$term}%");
                });
            })
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->withCount(['assignedTasks' => fn ($q) => $q->open()])
            ->orderBy('name')
            ->paginate($request->integer('per_page', 25));

        return UserResource::collection($users);
    }

    /** Lightweight list for the "assign to" picker. */
    public function technicians(): AnonymousResourceCollection
    {
        $technicians = User::query()
            ->active()
            ->role(UserRole::Technician)
            ->withCount(['assignedTasks' => fn ($q) => $q->open()])
            ->orderBy('name')
            ->get();

        return UserResource::collection($technicians);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', Rule::enum(UserRole::class)],
            'phone' => ['nullable', 'string', 'max:32'],
            'whatsapp' => ['nullable', 'string', 'max:32'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'is_active' => ['boolean'],
        ]);

        $user = User::create($data);

        ActivityLog::record('user.created', $user, "تم إنشاء المستخدم {$user->name}");

        return response()->json(new UserResource($user), 201);
    }

    public function show(User $user): UserResource
    {
        return new UserResource(
            $user->loadCount(['assignedTasks' => fn ($q) => $q->open()])
        );
    }

    public function update(Request $request, User $user): UserResource
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:8'],
            'role' => ['required', Rule::enum(UserRole::class)],
            'phone' => ['nullable', 'string', 'max:32'],
            'whatsapp' => ['nullable', 'string', 'max:32'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'is_active' => ['boolean'],
        ]);

        if (blank($data['password'] ?? null)) {
            unset($data['password']);
        }

        $user->update($data);

        ActivityLog::record('user.updated', $user, "تم تعديل المستخدم {$user->name}");

        return new UserResource($user->fresh());
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'لا يمكنك حذف حسابك الخاص.'], 422);
        }

        if ($user->assignedTasks()->open()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف فني لديه مهام مفتوحة. أعد إسناد مهامه أولاً.',
            ], 422);
        }

        $name = $user->name;
        $user->delete();

        ActivityLog::record('user.deleted', $user, "تم حذف المستخدم {$name}");

        return response()->json(['message' => 'تم حذف المستخدم.']);
    }
}
