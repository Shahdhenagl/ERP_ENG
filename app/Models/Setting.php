<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Key/value settings, cached because every printed document reads all of them.
 *
 * The defaults below are what a fresh install shows on its letterhead until
 * somebody fills the real details in — deliberately obvious placeholders
 * rather than blanks, so an unconfigured invoice looks unfinished instead of
 * looking like a company with no name.
 */
class Setting extends Model
{
    public $incrementing = false;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];

    /** @var array<string, string> */
    public const DEFAULTS = [
        'company_name' => 'City Engineering',
        'company_tagline' => 'Expertise in Standby Energy',
        'company_phone' => '',
        'company_email' => '',
        'company_address' => '',
        'company_tax_id' => '',
        'company_commercial_id' => '',
        'invoice_footer' => '',
        'quotation_terms' => '',
        // The conditions every offer closes with, as label/value pairs. A
        // quote may override them; most never need to.
        'quotation_conditions' => '[{"label": "الأسعار", "value": "الأسعار شاملة القيمة المضافة"}, {"label": "مدة التوريد", "value": "بضاعة حاضرة"}, {"label": "طريقة السداد", "value": "100% عند الاستلام"}, {"label": "الضمان", "value": "عام من تاريخ التوريد"}, {"label": "سريان العرض", "value": "أسبوع من تاريخه"}]',
        'default_tax_rate' => '14',
        // The company seal, as a path on the public disk. Empty until one
        // is uploaded — a document with no stamp simply carries none.
        'company_stamp' => '',
    ];

    protected static function booted(): void
    {
        // Any write invalidates the whole set; there are a dozen keys, so
        // rebuilding is cheaper than tracking which document uses which.
        static::saved(fn () => Cache::forget('settings'));
        static::deleted(fn () => Cache::forget('settings'));
    }

    /**
     * Every setting, stored values over defaults.
     *
     * Named `values()` rather than `all()` — Eloquent already defines a static
     * `all()` with a different signature, and shadowing it would break any
     * internal caller that expects a collection of models back.
     *
     * @return array<string, string>
     */
    public static function values(): array
    {
        // Only the stored rows are cached, and the defaults are laid under them
        // on every read. Caching the merged array meant a default added in a
        // release stayed invisible until somebody cleared the cache by hand —
        // and `rememberForever` means nobody ever would.
        $stored = Cache::rememberForever(
            'settings',
            fn () => array_filter(
                static::query()->pluck('value', 'key')->all(),
                fn ($value) => $value !== null && $value !== '',
            ),
        );

        return [...static::DEFAULTS, ...$stored];
    }

    public static function get(string $key, ?string $fallback = null): ?string
    {
        return static::values()[$key] ?? $fallback;
    }

    /** @param  array<string, string|null>  $values */
    public static function put(array $values): void
    {
        foreach ($values as $key => $value) {
            static::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        Cache::forget('settings');
    }
}
