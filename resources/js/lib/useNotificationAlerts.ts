import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { tr } from '@/lib/i18n'
import { useToast } from '@/components/Toast'
import { keys, useNotifications } from '@/lib/queries'
import type { AppNotification } from '@/types'

/**
 * Announces a new notification while the ERP is open on the laptop: a short
 * chime, an in-app side toast, and — when the browser has been allowed — a
 * desktop popup outside the tab. The bell keeps its own count untouched; this
 * only reacts to arrivals the poll surfaces, and never announces the batch that
 * was already there on first load.
 */
export function useNotificationAlerts() {
    const { data } = useNotifications()
    const toast = useToast()
    const queryClient = useQueryClient()
    const seen = useRef<Set<string> | null>(null)

    // Ask once, up front, so a later arrival can pop outside the tab.
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            void Notification.requestPermission()
        }
    }, [])

    useEffect(() => {
        const list = data?.data ?? []

        // First fetch: remember what is already there without announcing it.
        if (seen.current === null) {
            seen.current = new Set(list.map((n) => n.id))
            return
        }

        const fresh = list.filter((n) => !seen.current!.has(n.id) && !n.read_at)
        list.forEach((n) => seen.current!.add(n.id))

        fresh.forEach((notification) => {
            if (['task.status_changed', 'postponement_reviewed'].includes(notification.data.type)) {
                void queryClient.invalidateQueries({ queryKey: ['tasks'] })
                void queryClient.invalidateQueries({ queryKey: keys.dashboard })
                void queryClient.invalidateQueries({ queryKey: keys.notifications })
                if (notification.data.task_id) {
                    void queryClient.invalidateQueries({ queryKey: keys.task(notification.data.task_id) })
                }
            }
        })

        if (fresh.length === 0) return

        chime()

        const top = fresh[0]
        const { title, body } = textFor(top)
        toast.info(body ? `${title} — ${body}` : title)

        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                const popup = new Notification(title, {
                    body,
                    tag: top.id,
                    icon: '/brand/icon-192.png',
                })
                popup.onclick = () => window.focus()
            } catch {
                /* some browsers refuse construction; the toast already covered it */
            }
        }
    }, [data, queryClient, toast])
}

/** A short two-note chime, synthesized so no audio file has to ship. */
function chime() {
    try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return

        const ctx = new Ctx()
        void ctx.resume()

        const note = (freq: number, at: number, dur: number) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = 'sine'
            osc.frequency.value = freq
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
            gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur)
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.start(ctx.currentTime + at)
            osc.stop(ctx.currentTime + at + dur)
        }

        note(880, 0, 0.15)
        note(1174, 0.16, 0.22)
        setTimeout(() => void ctx.close(), 900)
    } catch {
        /* audio blocked — the toast and popup still land */
    }
}

/** The words to announce. Alerts carry their own; others get a label by type. */
function textFor(n: AppNotification): { title: string; body: string } {
    const d = n.data

    if (d.title || d.body) {
        return { title: d.title ?? 'إشعار', body: d.body ?? '' }
    }

    const byType: Record<string, string> = {
        'task.assigned': tr('مهمة جديدة مُسندة إليك'),
        'task.status': tr('تحديث حالة مهمة'),
        'followup.due': tr('متابعة مستحقة'),
    }

    return { title: byType[d.type] ?? 'إشعار جديد', body: (d.code as string) ?? '' }
}
