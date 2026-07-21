import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'

/**
 * Runs every browser suite, reseeding between each one.
 *
 * The suites write real data — accepting a quotation, booking a delivery,
 * consuming stock — so running them back to back would leave each one reading
 * whatever the last one left behind. Reseeding in between is what keeps a
 * failure a real failure rather than an artefact of the order they ran in.
 */
const PHP = process.env.PHP_BIN ?? findPhp()

function findPhp() {
    // Laragon on Windows keeps php outside PATH; fall back to whatever is there.
    const laragon = 'C:/laragon/bin/php'

    if (existsSync(laragon)) {
        const version = readdirSync(laragon).find((dir) => dir.startsWith('php-'))

        if (version) return `${laragon}/${version}/php.exe`
    }

    return 'php'
}

const only = process.argv.slice(2)
const suites = readdirSync('tests/Browser')
    .filter((file) => file.endsWith('.mjs'))
    .filter((file) => only.length === 0 || only.some((name) => file.includes(name)))
    .sort()

const artisan = (...args) => execFileSync(PHP, ['artisan', ...args], { stdio: 'ignore' })

/**
 * On a machine whose .env queues to the database with no worker running,
 * notifications would sit unsent and read as a broken feature. Draining
 * between suites makes the run behave the way production does, where the
 * queue is synchronous.
 */
const drainQueue = () => {
    try {
        artisan('queue:work', '--stop-when-empty', '--quiet')
    } catch {
        // No queue table, or already empty — neither is worth failing over.
    }
}

let failed = 0

for (const suite of suites) {
    artisan('db:wipe', '--force')
    artisan('migrate', '--force')
    artisan('db:seed', '--force')

    process.stdout.write(`\n── ${suite} ${'─'.repeat(Math.max(0, 50 - suite.length))}\n`)

    try {
        execFileSync('node', [`tests/Browser/${suite}`], { stdio: 'inherit' })
    } catch {
        failed++
    } finally {
        drainQueue()
    }
}

console.log(
    failed === 0
        ? `\nall ${suites.length} browser suites passed ✅`
        : `\n${failed} of ${suites.length} suites failed ❌`,
)

process.exit(failed === 0 ? 0 : 1)
