import { api } from '@/lib/api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** VAPID keys arrive base64url-encoded; the Push API wants an ArrayBuffer view. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = window.atob(base64)
    const bytes = new Uint8Array(new ArrayBuffer(raw.length))

    for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i)
    }

    return bytes
}

export function pushSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushPermission(): NotificationPermission | 'unsupported' {
    return pushSupported() ? Notification.permission : 'unsupported'
}

/**
 * On iOS the Push API only exists once the site has been added to the home
 * screen — worth telling the user rather than silently failing.
 */
export function isStandalone(): boolean {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window.navigator as any).standalone === true
    )
}

export function isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/**
 * Ask for permission, subscribe with the browser's push service, and hand the
 * subscription to the server so it can reach this device later.
 */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
    if (!pushSupported()) {
        return {
            ok: false,
            reason: isIos()
                ? 'على الآيفون، أضف الموقع إلى الشاشة الرئيسية أولاً ثم فعّل الإشعارات.'
                : 'المتصفح لا يدعم الإشعارات.',
        }
    }

    if (!VAPID_PUBLIC_KEY) {
        return { ok: false, reason: 'مفتاح الإشعارات غير مضبوط على الخادم.' }
    }

    const permission = await Notification.requestPermission()

    if (permission !== 'granted') {
        return { ok: false, reason: 'تم رفض إذن الإشعارات من المتصفح.' }
    }

    const registration = await navigator.serviceWorker.ready

    const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }))

    const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }

    await api.post('/push-subscriptions', {
        endpoint: json.endpoint,
        keys: json.keys,
    })

    return { ok: true }
}

export async function disablePush(): Promise<void> {
    if (!pushSupported()) return

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (!subscription) return

    await api.delete('/push-subscriptions', { data: { endpoint: subscription.endpoint } })
    await subscription.unsubscribe()
}
