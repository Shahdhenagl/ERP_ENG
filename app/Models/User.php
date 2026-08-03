<?php

namespace App\Models;

use App\Enums\UserRole;
use App\Services\PermissionRegistry;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use NotificationChannels\WebPush\HasPushSubscriptions;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasPushSubscriptions, Notifiable, SoftDeletes;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'position',
        'phone',
        'whatsapp',
        'job_title',
        'avatar_path',
        'is_active',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    // The column defaults to true in the database, but a model that was just
    // created carries whatever it was handed — leaving is_active null on the
    // instance, which reads as suspended to every guard that checks it.
    protected $attributes = [
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
            'is_active' => 'boolean',
        ];
    }

    // ── Relations ────────────────────────────────────────────

    /** Jobs this user has to carry out (they are the technician). */
    public function assignedTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assigned_to');
    }

    /** Jobs this user dispatched (they are the manager). */
    public function createdTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'created_by');
    }

    /** The HR file behind this login, when one has been opened. */
    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class);
    }

    /** @var array<string, bool>|null */
    protected ?array $permissionCache = null;

    // ── Role helpers ─────────────────────────────────────────

    public function isAdmin(): bool
    {
        return $this->role === UserRole::Admin;
    }

    public function isManager(): bool
    {
        return $this->role === UserRole::Manager;
    }

    public function isTechnician(): bool
    {
        return $this->role === UserRole::Technician;
    }

    public function canDispatch(): bool
    {
        return $this->role->canDispatch();
    }

    // ── Permissions ──────────────────────────────────────────

    public function permissionOverrides(): HasMany
    {
        return $this->hasMany(UserPermission::class);
    }

    /**
     * Whether this user may do something.
     *
     * The role's defaults answer unless a row on this user says otherwise —
     * which is what lets a storekeeper be an office user with inventory rights
     * rather than a fourth role nobody maintains.
     *
     * A suspended account is refused everything regardless. Deactivating
     * somebody has to take effect without anyone remembering to strip their
     * permissions too.
     */
    public function hasPermission(string $permission): bool
    {
        if (! $this->is_active) {
            return false;
        }

        $override = $this->permissionMap()[$permission] ?? null;

        return $override ?? in_array($permission, $this->defaultPermissions(), true);
    }

    /** Everything this user may do, defaults and overrides folded together. */
    public function permissions(): array
    {
        if (! $this->is_active) {
            return [];
        }

        $overrides = $this->permissionMap();
        $defaults = $this->defaultPermissions();

        return array_values(array_filter(
            PermissionRegistry::keys(),
            fn (string $key) => $overrides[$key]
                ?? in_array($key, $defaults, true),
        ));
    }

    /**
     * The overrides, keyed by permission.
     *
     * Loaded once per instance: `hasPermission` is called several times on one
     * request and a query each time would turn a page render into a stampede.
     *
     * @return array<string, bool>
     */
    protected function permissionMap(): array
    {
        return $this->permissionCache ??= $this->permissionOverrides()
            ->pluck('granted', 'permission')
            ->map(fn ($granted) => (bool) $granted)
            ->all();
    }

    /**
     * The permissions the account starts with before any per-user override: the
     * job position's preset when one is set, otherwise the plain role defaults.
     *
     * @return array<int, string>
     */
    public function defaultPermissions(): array
    {
        if ($this->position && JobRole::exists($this->position)) {
            return JobRole::permissionsFor($this->position);
        }

        return PermissionRegistry::defaultsFor($this->role);
    }

    /** WhatsApp number falls back to the plain phone when not set separately. */
    public function whatsappNumber(): ?string
    {
        return $this->whatsapp ?: $this->phone;
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** Reads better than role(UserRole::Technician) at every call site. */
    public function scopeTechnicians(Builder $query): Builder
    {
        return $query->where('role', UserRole::Technician->value);
    }

    public function scopeRole(Builder $query, UserRole $role): Builder
    {
        return $query->where('role', $role->value);
    }
}
