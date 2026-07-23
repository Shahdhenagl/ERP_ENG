import { chromium } from 'playwright'

/**
 * The dashboard's expiry alerts.
 *
 * A signed contract and a sold warranty are both promises with an end date, and
 * a schedule nobody is reminded of is worthless. Each alert is a renewal or an
 * extension waiting to be sold — before the customer feels uncovered, not after.
 */

const BASE = 'http://127.0.0.1:8000'
const browser = await chromium.launch()

let failures = 0
const check = (label, pass) => {
    console.log(`${pass ? '✓' : '❌'} ${label}`)
    if (!pass) failures++
}

async function login(page, email) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button[type=submit]')
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', 'password')
    await page.click('button[type=submit]')
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 })
}

async function sees(page, text, timeout = 25000) {
    return page
        .waitForFunction((t) => document.body.innerText.includes(t), text, { timeout })
        .then(() => true)
        .catch(() => false)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'manager@cityeng.local')

/* ── Seed an asset with cover about to lapse ─────────────── */

const seeded = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const get = async (url) => (await fetch(url, { headers })).json()
    const post = async (url, body) =>
        (await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).json()

    const customers = await get('/api/customers?per_page=1')

    const asset = await post('/api/assets', {
        customer_id: customers.data[0].id,
        brand: 'APC',
        model: 'Symmetra',
        serial: `EXP-${Date.now()}`,
    })

    const soon = new Date(Date.now() + 18 * 864e5).toISOString().slice(0, 10)

    const warranty = await post('/api/warranties', {
        asset_id: asset.data?.id ?? asset.id,
        ends_on: soon,
    })

    return { code: warranty.data?.code ?? warranty.code }
})

check('created a warranty about to expire', Boolean(seeded.code))

/* ── It shows on the dashboard ───────────────────────────── */

await page.goto(`${BASE}/manager`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

check('the warranty alert appears', await sees(page, 'ضمانات قاربت على الانتهاء'))
check('it names the cover that is lapsing', await sees(page, seeded.code))
check(
    'it states how long is left',
    /باقٍ\s+\d+\s+يوم/.test(await page.locator('body').innerText()),
)

/* ── The API scopes it away from a technician ────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/tech`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

check(
    'a technician is not shown the office chase list',
    !(await sees(page, 'ضمانات قاربت على الانتهاء', 3000)),
)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\ndashboard alerts work ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
