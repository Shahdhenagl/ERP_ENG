import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import '../css/app.css'

/**
 * The worker is served from the web root (see scripts/publish-sw.mjs) so its
 * scope covers the whole app rather than just /build. Registered by hand
 * instead of via `virtual:pwa-register`, which would point at /build/sw.js.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
            console.error('Service worker registration failed', error)
        })
    })
}

const container = document.getElementById('app')

if (!container) {
    throw new Error('Root element #app not found')
}

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
