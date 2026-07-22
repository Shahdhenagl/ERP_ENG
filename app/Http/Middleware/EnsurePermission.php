<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route guard: `->middleware('can:inventory.manage')`.
 *
 * Sits inside the role guard rather than replacing it. The role still decides
 * which application a user gets — a technician has no business on an office
 * route whatever permissions somebody ticked — and this decides what they may
 * do once they are in the right one.
 *
 * Several permissions may be listed, and any one of them is enough: a screen
 * reachable two ways should not need the caller to know which.
 */
class EnsurePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (! $user || ! $user->is_active) {
            return response()->json(['message' => 'غير مصرح بالدخول.'], 403);
        }

        foreach ($permissions as $permission) {
            if ($user->hasPermission($permission)) {
                return $next($request);
            }
        }

        return response()->json(['message' => 'ليس لديك صلاحية لهذا الإجراء.'], 403);
    }
}
