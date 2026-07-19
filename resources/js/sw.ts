/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

/* ── Precache the app shell ──────────────────────────────── */
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => {
    void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim())
})

/* ── Push notifications ──────────────────────────────────── */

interface PushPayload {
    title?: string
    body?: string
    icon?: string
    badge?: string
    tag?: string
    data?: { url?: string; task_id?: number }
}

self.addEventListener('push', (event) => {
    if (!event.data) return

    let payload: PushPayload = {}

    try {
        payload = event.data.json() as PushPayload
    } catch {
        payload = { title: 'City Engineering', body: event.data.text() }
    }

    const title = payload.title ?? 'City Engineering'

    event.waitUntil(
        self.registration.showNotification(title, {
            body: payload.body ?? '',
            icon: payload.icon ?? '/brand/icon-192.png',
            badge: payload.badge ?? '/brand/badge.png',
            tag: payload.tag,
            // Re-alert on an update rather than silently swapping the text.
            renotify: Boolean(payload.tag),
            dir: 'rtl',
            lang: 'ar',
            vibrate: [180, 80, 180],
            data: payload.data ?? {},
        } as NotificationOptions),
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/'

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Reuse an open tab when there is one — opening a second copy of
                // the app on every notification is a common annoyance.
                for (const client of clientList) {
                    if ('focus' in client) {
                        void client.focus()

                        if ('navigate' in client) {
                            return client.navigate(target)
                        }

                        return undefined
                    }
                }

                return self.clients.openWindow(target)
            }),
    )
})
