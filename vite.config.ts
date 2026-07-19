import { defineConfig } from 'vite'
import laravel from 'laravel-vite-plugin'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/main.tsx'],
            refresh: true,
        }),
        react(),
        tailwindcss(),
        VitePWA({
            // We hand-write the service worker so it can handle push events;
            // Workbox still generates the precache manifest for us.
            strategies: 'injectManifest',
            srcDir: 'resources/js',
            filename: 'sw.ts',
            registerType: 'autoUpdate',
            injectRegister: null, // registered manually in main.tsx
            manifest: {
                name: 'City Engineering — نظام إدارة العمليات',
                short_name: 'City Eng',
                description: 'إدارة مهام التركيب والصيانة للفنيين والمديرين',
                lang: 'ar',
                dir: 'rtl',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                orientation: 'portrait',
                background_color: '#0b1b3a',
                theme_color: '#0b1b3a',
                icons: [
                    { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                // Vite emits precache URLs relative to the service worker. The
                // built SW gets copied to the web root (so its scope covers the
                // whole app), so those URLs must be absolute /build/… instead.
                modifyURLPrefix: { '': '/build/' },
            },
            devOptions: {
                enabled: false,
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'resources/js'),
        },
    },
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
})
