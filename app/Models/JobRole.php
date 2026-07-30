<?php

namespace App\Models;

use App\Enums\UserRole;
use App\Services\PermissionRegistry;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * A job — its name, the application it gets, and the permissions it carries.
 *
 * The permission catalogue stays in code; this only decides which of them a
 * job holds, which is a question about how the company is organised rather
 * than about the software. An administrator adds a role, names it, ticks what
 * it may do, and every account given that role follows.
 *
 * Cached because `defaultPermissions()` is consulted on every permission check
 * of every request, and the table changes about as often as the org chart.
 */
class JobRole extends Model
{
    protected $fillable = ['key', 'name', 'base_role', 'permissions', 'sort'];

    protected function casts(): array
    {
        return ['permissions' => 'array'];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Cache::forget('job-roles'));
        static::deleted(fn () => Cache::forget('job-roles'));
    }

    /**
     * Every role, keyed, as plain arrays.
     *
     * @return array<string, array{name: string, base_role: string, permissions: array<int, string>}>
     */
    public static function map(): array
    {
        return Cache::rememberForever('job-roles', fn () => static::query()
            ->orderBy('sort')
            ->get()
            ->mapWithKeys(fn (self $role) => [$role->key => [
                'name' => $role->name,
                'base_role' => $role->base_role,
                'permissions' => $role->permissions ?? [],
            ]])
            ->all());
    }

    public static function exists(string $key): bool
    {
        return isset(static::map()[$key]);
    }

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_keys(static::map());
    }

    public static function label(string $key): string
    {
        return static::map()[$key]['name'] ?? $key;
    }

    /** Which application the role gets. */
    public static function roleFor(string $key): UserRole
    {
        return UserRole::tryFrom(static::map()[$key]['base_role'] ?? '') ?? UserRole::Manager;
    }

    /**
     * What the role grants, before any per-user exception.
     *
     * Filtered against the catalogue so a permission dropped in a release
     * stops being granted, rather than lingering in a row nobody reads.
     *
     * @return array<int, string>
     */
    public static function permissionsFor(string $key): array
    {
        return array_values(array_filter(
            static::map()[$key]['permissions'] ?? [],
            fn (string $permission) => PermissionRegistry::exists($permission),
        ));
    }

    /**
     * For the picker: key + label, in the order defined.
     *
     * @return array<int, array{key: string, label: string}>
     */
    public static function options(): array
    {
        return array_map(
            fn (string $key) => ['key' => $key, 'label' => static::label($key)],
            static::keys(),
        );
    }
}
