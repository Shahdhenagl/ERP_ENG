import { chromium } from 'playwright'

/**
 * The audit trail.
 *
 * The check that matters most is the one about a refused login: an audit log
 * that records only successful actions answers the least interesting half of
 * the question it exists for.
 */

const BASE = 'http://127.0.0.1:8000'
const browser = await chromium.launch()

let failures = 0
const check = (label, pass) => {
    console.log(`${pass ? '✓' : '❌'} ${label}`)
    if (!pass) failures++
}

async function login(page, email, password = 'password') {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button[type=submit]')
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    await page.click('button[type=submit]')
}

async function sees(page, text, timeout = 25000) {
    return page
        .waitForFunction((t) => document.body.innerText.includes(t), text, { timeout })
        .then(() => true)
        .catch(() => false)
}

async function settled(page) {
    await page
        .waitForFunction(
            () => !document.querySelector('.shimmer') && !document.querySelector('.animate-spin'),
            { timeout: 20000 },
        )
        .catch(() => {})
    await page.waitForTimeout(400)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

/* ── A refused login is the event worth recording ────────── */

await login(page, 'manager@cityeng.local', 'definitely-not-the-password')
await page.waitForTimeout(2500)

check(
    'a wrong password does not get in',
    page.url().includes('/login'),
)

/* ── An admin can read the trail ─────────────────────────── */

await login(page, 'admin@cityeng.local')
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 })
await settled(page)

const link = page.locator('aside a[href="/manager/audit"]').first()
check('سجل العمليات is nested under الإدارة', await link.isVisible())

await link.click()
await page.waitForURL(/\/manager\/audit$/, { timeout: 20000 })
await settled(page)

check('the trail opens', await sees(page, 'سجل العمليات'))
check('it records the successful login', await sees(page, 'الدخول · تسجيل دخول'))

/* ── The refused attempt is in it ────────────────────────── */

const refused = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const body = await (
        await fetch('/api/activity?action=auth.failed', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
    ).json()

    return {
        count: body.data.length,
        description: body.data[0]?.description ?? '',
        sensitive: body.data[0]?.is_sensitive ?? false,
        ip: body.data[0]?.ip_address ?? null,
    }
})

check(`the refused login was recorded — ${refused.count}`, refused.count >= 1)
check('it names the address that was tried', refused.description.includes('manager@cityeng.local'))
check('it is flagged as sensitive', refused.sensitive === true)
check('it carries the IP it came from', Boolean(refused.ip))

/* ── Filters ─────────────────────────────────────────────── */

await page.getByRole('button', { name: /العمليات الحسّاسة/ }).click()
await page.waitForTimeout(1500)
await settled(page)

check('the sensitive filter finds the refused login', await sees(page, 'محاولة فاشلة'))

const onlySensitive = await page.evaluate(() =>
    [...document.querySelectorAll('.badge')]
        .map((b) => b.innerText.trim())
        .filter((t) => t.includes('·'))
        .every((t) => !t.includes('إنشاء العميل')),
)
check('and hides the ordinary entries', onlySensitive)

// Turn it off again, then narrow by module.
await page.getByRole('button', { name: /العمليات الحسّاسة/ }).click()
await page.waitForTimeout(1200)

await page.locator('select').first().selectOption('auth')
await page.waitForTimeout(1500)
await settled(page)

check('narrowing to a module works', await sees(page, 'الدخول'))

/* ── The action reads as Arabic, not as a key ────────────── */

const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.badge')].map((b) => b.innerText.trim()),
)

check(
    'actions are translated rather than shown raw',
    labels.some((l) => l.includes('الدخول')) && !labels.some((l) => l.includes('auth.')),
)

/* ── A manager cannot read it ────────────────────────────── */

await login(page, 'manager@cityeng.local')
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 })

await page.goto(`${BASE}/manager/audit`, { waitUntil: 'domcontentloaded' })

// Waited for rather than slept through: the redirect happens once the session
// has loaded, and under a full sweep that takes longer than any fixed pause.
await page
    .waitForFunction(() => !location.pathname.includes('/audit'), null, { timeout: 25000 })
    .catch(() => {})

// The route is admin-only, so a manager is sent back to their own area.
check(
    'a manager is kept out of the trail',
    !page.url().includes('/audit'),
)

const forbidden = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const response = await fetch('/api/activity', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })

    return response.status
})
check(`and the API refuses them — ${forbidden}`, forbidden === 403)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\naudit trail works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
