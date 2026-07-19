<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| SPA entry point
|--------------------------------------------------------------------------
| Every non-API, non-asset URL renders the React shell and lets the client
| router take over. The `where` guard keeps real files (build assets, the
| manifest, the service worker, uploads) out of the catch-all.
*/
Route::get('/{any?}', fn () => view('app'))
    ->where('any', '^(?!api|build|storage|brand|fonts|sw\.js|sw\.js\.map|manifest\.webmanifest|robots\.txt|favicon\.ico).*$');
