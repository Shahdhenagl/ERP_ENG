<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reading the audit trail.
 *
 * There is no write endpoint and there never should be: entries are a
 * by-product of doing the work, and a log anyone can add to or edit answers
 * nothing. Nothing here deletes either — a trail with a delete button is a
 * trail whose absence proves nothing.
 */
class ActivityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'user_id' => ['nullable', 'exists:users,id'],
            'module' => ['nullable', 'string', 'max:64'],
            'action' => ['nullable', 'string', 'max:64'],
        ]);

        $logs = ActivityLog::query()
            ->search($request->string('search')->toString() ?: null)
            ->forModule($request->string('module')->toString() ?: null)
            ->when($request->string('action')->toString(), fn ($q, $a) => $q->where('action', $a))
            ->when($request->integer('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($request->boolean('sensitive'), fn ($q) => $q->sensitive())
            ->when($request->date('from'), fn ($q, $from) => $q->whereDate('created_at', '>=', $from))
            ->when($request->date('to'), fn ($q, $to) => $q->whereDate('created_at', '<=', $to))
            ->with('user')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 50));

        return response()->json([
            'data' => $logs->through(fn (ActivityLog $log) => [
                'id' => $log->id,
                'action' => $log->action,
                'module' => $log->module(),
                'module_label' => $log->moduleLabel(),
                'verb_label' => $log->verbLabel(),
                'label' => $log->label(),
                // Flagged rather than hidden: these are the rows someone
                // reviewing the log came to find.
                'is_sensitive' => $log->isSensitive(),

                'description' => $log->description,
                'properties' => $log->properties,

                'user_id' => $log->user_id,
                'user' => $log->user?->name,
                // Null on a failed login with an unknown address, which is
                // exactly the case worth seeing.
                'user_role' => $log->user?->role_label,

                'subject_type' => $log->subject_type
                    ? class_basename($log->subject_type)
                    : null,
                'subject_id' => $log->subject_id,

                'ip_address' => $log->ip_address,
                'created_at' => $log->created_at?->toIso8601String(),
            ])->items(),
            'meta' => [
                'total' => $logs->total(),
                'last_page' => $logs->lastPage(),
                'current_page' => $logs->currentPage(),
            ],
        ]);
    }

    /**
     * What the filters can offer.
     *
     * Modules are taken from what has actually been recorded rather than from
     * the full map — a dropdown listing twenty modules that have never produced
     * an entry is a list of dead ends.
     */
    public function filters(): JsonResponse
    {
        $recorded = ActivityLog::query()
            ->selectRaw('action, count(*) as total')
            ->groupBy('action')
            ->pluck('total', 'action');

        $modules = collect($recorded->keys())
            ->map(fn (string $action) => str_contains($action, '.')
                ? substr($action, 0, strrpos($action, '.'))
                : $action)
            ->unique()
            ->map(fn (string $module) => [
                'value' => $module,
                'label' => ActivityLog::MODULES[$module] ?? $module,
            ])
            ->sortBy('label')
            ->values();

        return response()->json([
            'modules' => $modules,
            'actions' => $recorded->map(fn ($total, $action) => [
                'value' => $action,
                'total' => $total,
            ])->values(),
            'users' => User::query()
                ->whereIn('id', ActivityLog::query()->distinct()->pluck('user_id')->filter())
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn (User $user) => ['value' => $user->id, 'label' => $user->name]),
            'sensitive_count' => ActivityLog::query()->sensitive()->count(),
        ]);
    }
}
