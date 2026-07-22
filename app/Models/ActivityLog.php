<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

class ActivityLog extends Model
{
    protected $fillable = [
        'user_id',
        'action',
        'subject_type',
        'subject_id',
        'description',
        'properties',
        'ip_address',
        'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'properties' => 'array',
        ];
    }

    /**
     * Actions are named `module.verb`, and are read back by translating the two
     * halves separately rather than from a list of every combination.
     *
     * There are already seventy of them. A single map would have to be edited
     * every time an action is added, and the day someone forgets, the log shows
     * a raw key. Splitting it means a new verb on a known module reads properly
     * on its own, and anything genuinely unknown falls back to the raw action —
     * which is ugly, but honest, and never wrong.
     */
    public const MODULES = [
        'auth' => 'الدخول',
        'user' => 'المستخدمون',
        'customer' => 'العملاء',
        'branch' => 'الفروع',
        'asset' => 'الأجهزة',
        'task' => 'أوامر العمل',
        'contract' => 'العقود',
        'warranty' => 'الضمانات',
        'item' => 'الأصناف',
        'stock' => 'المخزون',
        'custody' => 'العهد',
        'quotation' => 'عروض الأسعار',
        'sales_order' => 'أوامر البيع',
        'sales_return' => 'مرتجعات المبيعات',
        'invoice' => 'الفواتير',
        'payment' => 'التحصيل',
        'supplier' => 'الموردون',
        'supplier_invoice' => 'فواتير الموردين',
        'purchase_order' => 'أوامر الشراء',
        'purchase_return' => 'مرتجعات المشتريات',
        'treasury' => 'الخزينة',
        'account' => 'دليل الحسابات',
        'journal' => 'القيود',
        'settings' => 'الإعدادات',
    ];

    public const VERBS = [
        'created' => 'إنشاء',
        'updated' => 'تعديل',
        'deleted' => 'حذف',
        'issued' => 'إصدار',
        'voided' => 'إلغاء',
        'cancelled' => 'إلغاء',
        'posted' => 'ترحيل',
        'reversed' => 'عكس',
        'sent' => 'إرسال',
        'accepted' => 'قبول',
        'rejected' => 'رفض',
        'delivered' => 'تسليم',
        'received' => 'استلام',
        'registered' => 'تسجيل',
        'extended' => 'تمديد',
        'claimed' => 'مطالبة',
        'assigned' => 'إسناد',
        'status_changed' => 'تغيير حالة',
        'login' => 'تسجيل دخول',
        'failed' => 'محاولة فاشلة',
        'blocked' => 'حساب موقوف',
        'password_changed' => 'تغيير كلمة المرور',
        'repair_order' => 'أمر إصلاح',
    ];

    /** Events worth picking out of a long list at a glance. */
    public const SENSITIVE = [
        'auth.failed',
        'auth.blocked',
        'user.created',
        'user.updated',
        'user.deleted',
        'settings.updated',
        'invoice.voided',
        'payment.reversed',
        'supplier_invoice.voided',
        'journal.reversed',
        'journal.voided',
        'warranty.voided',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // ── Reading it back ──────────────────────────────────────

    /** The part before the dot: which module the event belongs to. */
    public function module(): string
    {
        return str_contains($this->action, '.')
            ? substr($this->action, 0, strrpos($this->action, '.'))
            : $this->action;
    }

    public function moduleLabel(): string
    {
        return self::MODULES[$this->module()] ?? $this->module();
    }

    public function verbLabel(): string
    {
        $verb = str_contains($this->action, '.')
            ? substr($this->action, strrpos($this->action, '.') + 1)
            : '';

        return self::VERBS[$verb] ?? $verb;
    }

    /** «الفواتير · إصدار», falling back to the raw action when unknown. */
    public function label(): string
    {
        $verb = $this->verbLabel();

        return $verb === '' ? $this->action : "{$this->moduleLabel()} · {$verb}";
    }

    public function isSensitive(): bool
    {
        return in_array($this->action, self::SENSITIVE, true);
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('description', 'like', "%{$term}%")
                ->orWhere('action', 'like', "%{$term}%")
                ->orWhere('ip_address', 'like', "%{$term}%")
                ->orWhereHas('user', fn (Builder $u) => $u->where('name', 'like', "%{$term}%"));
        });
    }

    /** Everything from one module — `invoice` matches `invoice.issued`. */
    public function scopeForModule(Builder $query, ?string $module): Builder
    {
        return $module ? $query->where('action', 'like', "{$module}.%") : $query;
    }

    public function scopeSensitive(Builder $query): Builder
    {
        return $query->whereIn('action', self::SENSITIVE);
    }

    /**
     * Record an auditable event. Kept deliberately simple — one call site per
     * meaningful action rather than blanket model observers, so the log stays
     * readable instead of drowning in noise.
     */
    public static function record(
        string $action,
        ?Model $subject = null,
        ?string $description = null,
        array $properties = [],
    ): self {
        return static::create([
            'user_id' => Auth::id(),
            'action' => $action,
            'subject_type' => $subject ? $subject::class : null,
            'subject_id' => $subject?->getKey(),
            'description' => $description,
            'properties' => $properties ?: null,
            'ip_address' => Request::ip(),
            'user_agent' => substr((string) Request::userAgent(), 0, 500),
        ]);
    }
}
