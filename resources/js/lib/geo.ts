export interface Fix {
    lat: number
    lng: number
    at: number
}

/**
 * Where the phone is, for stamping onto a status change.
 *
 * Every transition is meant to carry one — it is the evidence that a job was
 * accepted from the yard and finished at the site. They were arriving empty
 * because the ask gave up after four seconds and resolved to nothing, silently:
 * a cold GPS on a phone routinely takes longer than that, and the four presses
 * of a job happen minutes apart, each one cold again.
 *
 * So: ask for longer, accept a recent fix rather than insisting on a new one,
 * and keep the last one we did get. A stamp from two minutes ago at the same
 * gate is worth incomparably more than no stamp at all.
 */

let lastFix: Fix | null = null

/** How stale a remembered fix may be before it stops standing in. */
const FIX_TTL = 5 * 60_000

function remember(position: GeolocationPosition): Fix {
    lastFix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        at: Date.now(),
    }

    return lastFix
}

/**
 * Start listening in the background.
 *
 * Called when a job is opened, so the fix is already warm by the time a button
 * is pressed rather than being asked for at the moment somebody is waiting.
 * Returns a stop function for the caller's cleanup.
 */
export function warmPosition(): () => void {
    if (!navigator.geolocation) return () => {}

    const id = navigator.geolocation.watchPosition(remember, () => {}, {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 20_000,
    })

    return () => navigator.geolocation.clearWatch(id)
}

/** The current position, or the last good one, or nothing. */
export async function currentPosition(): Promise<{ lat?: number; lng?: number }> {
    if (!navigator.geolocation) return fallback()

    const fresh = await new Promise<Fix | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => resolve(remember(position)),
            () => resolve(null),
            // Long enough for a cold fix, and happy with a recent one: the point
            // is which gate the technician stood at, not which metre of it.
            { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
        )
    })

    if (fresh) return { lat: fresh.lat, lng: fresh.lng }

    return fallback()
}

function fallback(): { lat?: number; lng?: number } {
    if (lastFix && Date.now() - lastFix.at < FIX_TTL) {
        return { lat: lastFix.lat, lng: lastFix.lng }
    }

    return {}
}
