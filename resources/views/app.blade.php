<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    {{-- Pinch-zoom and double-tap-zoom are off on purpose: this ships as an
         installed app, and a field technician tapping status buttons with
         gloves on kept zooming the page by accident. --}}
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
    <title>{{ config('app.name') }} — نظام إدارة التركيب والصيانة</title>

    <meta name="description" content="نظام إدارة مهام التركيب والصيانة لأجهزة UPS — City Engineering">
    <meta name="theme-color" content="#0b1b3a">

    {{-- Installed-app behaviour on iOS --}}
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="City Eng">
    <link rel="apple-touch-icon" href="/brand/icon-192.png">

    <link rel="icon" type="image/png" href="/brand/icon-192.png">
    <link rel="manifest" href="/manifest.webmanifest">

    {{-- The Cairo webfont is self-hosted so the app still renders correctly
         on a site with no outbound internet access. --}}
    <link rel="preload" href="/fonts/cairo-arabic.woff2" as="font" type="font/woff2" crossorigin>

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/main.tsx'])
</head>
<body>
    <div id="app"></div>

    <noscript>
        <div style="padding:2rem;text-align:center;font-family:sans-serif">
            هذا النظام يحتاج إلى تفعيل JavaScript في المتصفح.
        </div>
    </noscript>
</body>
</html>
