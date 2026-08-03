<?php

namespace App\Http\Middleware;

use App\Support\Terms;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * The API answers in the language the caller is reading.
 *
 * A status label, a validation message and the words on a printed document all
 * come from here, and an English screen showing an Arabic status is not partly
 * translated — it is two languages in one row.
 *
 * Read from our own header rather than `Accept-Language`. Browsers send that
 * one themselves — `en-us,en;q=0.5` by default — so keying off it would answer
 * in English to somebody who chose Arabic, purely because of how their machine
 * is set up. The language is a choice the person made in the app, and only the
 * app should be able to state it.
 */
class SetLocaleFromRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        // Set both ways, not just the English one. Leaving the other case to
        // the app default makes the API's language depend on a config value
        // that has nothing to do with who is calling.
        App::setLocale(
            strtolower($request->header('X-App-Locale', '')) === 'en' ? 'en' : 'ar',
        );

        Terms::flush();

        return $next($request);
    }
}
