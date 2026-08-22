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
 * The required actions use a fresh browser fix. If the browser cannot provide
 * one, the caller must stop rather than silently stamping an old location.
 */

let lastFix: Fix | null = null

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

/** The current browser position, or nothing when GPS is unavailable. */
export async function currentPosition(): Promise<{ lat?: number; lng?: number }> {
    if (!navigator.geolocation) return {}

    const fresh = await new Promise<Fix | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => resolve(remember(position)),
            () => resolve(null),
            // A fresh fix is required for attendance and field status evidence.
            { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
        )
    })

    return fresh ? { lat: fresh.lat, lng: fresh.lng } : {}
}
