<?php

namespace App\Http\Middleware;

use App\Support\Terms;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route guard: `->middleware('role:admin,manager')`.
 */
class EnsureUserRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user || ! $user->is_active) {
            return response()->json(['message' => Terms::get('غير مصرح بالدخول.')], 403);
        }

        if ($roles && ! in_array($user->role->value, $roles, true)) {
            return response()->json(['message' => Terms::get('ليس لديك صلاحية لهذا الإجراء.')], 403);
        }

        return $next($request);
    }
}
