/**
 * A service worker can only control pages at or below its own path. Vite
 * writes the built worker into public/build, which would limit its scope to
 * /build/* — so it is copied to the web root after every build.
 *
 * Precache URLs are already rewritten to absolute /build/… paths by the
 * `modifyURLPrefix` option in vite.config.ts.
 */
import { copyFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()

const files = [
    ['public/build/sw.js', 'public/sw.js'],
    ['public/build/manifest.webmanifest', 'public/manifest.webmanifest'],
]

for (const [from, to] of files) {
    const source = join(root, from)

    try {
        await access(source)
    } catch {
        console.error(`✗ missing ${from} — did the build run?`)
        process.exit(1)
    }

    await copyFile(source, join(root, to))
    console.log(`✓ ${from} → ${to}`)
}
