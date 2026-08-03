<?php

namespace App\Support;

use Illuminate\Support\Facades\App;

/**
 * Arabic in, the caller's language out.
 *
 * Arabic is the source language of this system: every label is written in it,
 * and English is a lookup laid over the top, keyed by the Arabic itself. A
 * phrase with no English yet falls through to what was written — which is what
 * lets the translation land in batches without the API ever answering with a
 * blank or a key.
 *
 * The same dictionary the interface reads, generated into PHP so the two
 * cannot drift.
 */
class Terms
{
    /** @var array<string, string>|null */
    protected static ?array $map = null;

    public static function get(string $arabic): string
    {
        if (App::getLocale() !== 'en') {
            return $arabic;
        }

        static::$map ??= require lang_path('en/terms.php');

        return static::$map[$arabic] ?? $arabic;
    }

    /** Cleared between requests in tests, where the locale changes per call. */
    public static function flush(): void
    {
        static::$map = null;
    }
}
