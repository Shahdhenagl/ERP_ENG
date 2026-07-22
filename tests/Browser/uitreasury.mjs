import { chromium } from 'playwright'

/**
 * The treasury as a period report: reachable from under الفواتير in the
 * sidebar, filtered by day/month/year, opening a second box, and reading one
 * box's ledger with the balance carried down.
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

/**
 * Wait for text to appear rather than for a fixed number of seconds.
 *
 * `artisan serve` runs one worker unless PHP_CLI_SERVER_WORKERS is set, so
 * every request on a page queues behind the last one. A timed wait passes when
 * this suite runs alone and fails when it runs after fourteen others.
 */
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
    await page.waitForTimeout(500)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// Only an admin gets the sidebar, and the nesting is what this checks first.
await login(page, 'admin@cityeng.local')

/* ── Money in, so the period has something to report ─────── */

const collected = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const post = async (url, body) =>
        (await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).json()

    const customers = await (await fetch('/api/customers?per_page=1', { headers })).json()

    // Raised here rather than reused from the seed: the seeded invoice may
    // already be settled, and a receipt against a paid invoice is refused.
    const invoice = await post('/api/invoices', {
        customer_id: customers.data[0].id,
        lines: [{ description: 'كشف الخزينة', qty: 1, unit_price: 4000 }],
    })

    const id = invoice.data?.id ?? invoice.id
    await post(`/api/invoices/${id}/issue`, {})
    const payment = await post('/api/payments', { invoice_id: id, amount: 2500 })

    return payment.id || payment.data?.id ? 2500 : null
})

check(`collected against a fresh invoice — ${collected}`, collected === 2500)

/* ── The sidebar reaches it through الفواتير ─────────────── */

await page.goto(`${BASE}/manager/invoices`, { waitUntil: 'domcontentloaded' })
await settled(page)

const sidebarLink = page.locator('aside a[href="/manager/treasury"]').first()
check('الخزينة sits under الفواتير in the sidebar', await sidebarLink.isVisible())

await sidebarLink.click()
await page.waitForURL(/\/manager\/treasury$/, { timeout: 20000 })
await page.waitForSelector('text=حركة الخزينة', { timeout: 20000 })
await settled(page)

/* ── The analysis ────────────────────────────────────────── */

check('shows the opening balance', await sees(page, 'رصيد أول المدة'))
check('shows total income', await sees(page, 'إجمالي الإيراد'))
check('shows total expense', await sees(page, 'إجمالي المصروف'))
check('states the net for the period', await sees(page, 'صافي الفترة'))
check('breaks income down by cause', await sees(page, 'تحصيل من العملاء'))

/* ── Filters ─────────────────────────────────────────────── */

// This month must include what was just collected; "today" is a subset of it,
// so the figure may only fall, never rise.
const monthTotal = await readIncome(page, 'هذا الشهر')
const yearTotal = await readIncome(page, 'هذه السنة')
const allTotal = await readIncome(page, 'الكل')

check(`month ≤ year ≤ all — ${monthTotal} / ${yearTotal} / ${allTotal}`,
    monthTotal <= yearTotal + 0.01 && yearTotal <= allTotal + 0.01)
check(`this month picked up the collection — ${monthTotal}`, monthTotal >= (collected ?? 0))

// A custom window in the past has no receipts in it at all. The previous
// figure stays on screen while the new one loads, so wait for the response
// rather than for a spinner that never appears.
const narrowed = page.waitForResponse(
    (r) => r.url().includes('from=2001-01-01') && r.url().includes('to=2001-01-31'),
    { timeout: 20000 },
)
await page.locator('input[type=date]').first().fill('2001-01-01')
await page.locator('input[type=date]').nth(1).fill('2001-01-31')
await narrowed
await page.waitForTimeout(1000)
await settled(page)

const emptyWindow = await currentIncome(page)
check(`a window before the company existed reports nothing — ${emptyWindow}`, emptyWindow === 0)

await page.getByRole('button', { name: 'إلغاء التحديد' }).click()
await page.waitForTimeout(1200)
await settled(page)

/* ── Opening a second box ────────────────────────────────── */

const name = `حساب البنك ${Date.now().toString().slice(-5)}`

await page.getByRole('button', { name: 'خزينة جديدة' }).click()
await page.waitForTimeout(800)

const dialog = page.locator('[role=dialog]')
await dialog.locator('input[type=text], input:not([type])').first().fill(name)
await dialog.locator('select').first().selectOption('bank')

const opened = page.waitForResponse(
    (r) => r.url().includes('/api/treasury/boxes') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await dialog.getByRole('button', { name: 'حفظ' }).click()
check(`second box opened — ${(await opened).status()}`, (await opened).status() === 201)

check('the new box is listed', await sees(page, name))

/* ── One box's account ───────────────────────────────────── */

const mainBox = page.getByText('الخزينة الرئيسية').first()
await mainBox.waitFor({ state: 'visible', timeout: 25000 })
await mainBox.click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })

// The statement is fetched when the dialog opens, so wait for its own rows
// rather than for the dialog frame that appears immediately.
check('the statement names the box', await sees(page, 'كشف الخزينة الرئيسية'))
check('the statement lists the collection', await sees(page, 'تحصيل من العملاء'))
await settled(page)

const statement = await page.locator('[role=dialog]').innerText()
check('the statement carries a balance column', statement.includes('الرصيد'))

// The last row's running balance must equal the closing figure — that is the
// whole point of a statement, and it is where an off-by-one would show.
const consistent = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role=dialog] tbody tr')]
    if (rows.length === 0) return true

    const clean = (text) => Number(text.replace(/[^\d.-]/g, ''))
    const last = clean(rows.at(-1).lastElementChild.innerText)

    const closing = [...document.querySelectorAll('[role=dialog] .card')]
        .find((card) => card.innerText.includes('الرصيد'))
    return closing ? Math.abs(clean(closing.innerText) - last) < 0.01 : false
})
check('the running balance ends at the closing balance', consistent)

/* ── A manager has no sidebar, so the strip has to carry it ── */

await login(page, 'manager@cityeng.local')
await page.goto(`${BASE}/manager/invoices`, { waitUntil: 'domcontentloaded' })
await settled(page)

check('a manager gets no sidebar', (await page.locator('aside').count()) === 0)

const strip = page.locator('a[href="/manager/treasury"]').first()
check('the invoices page still offers الخزينة', await strip.isVisible())

await strip.click()
await page.waitForURL(/\/manager\/treasury$/, { timeout: 20000 })
await page.waitForSelector('text=صافي الفترة', { timeout: 20000 })
check('a manager reaches the treasury without a sidebar', true)

/* ── A technician has no business here ───────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/treasury`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is bounced out of the treasury', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\ntreasury works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)

/* ── Helpers ─────────────────────────────────────────────── */

async function readIncome(page, preset) {
    await page.getByRole('button', { name: preset, exact: true }).click()

    // The previous figure stays on screen while the new one loads, so a fixed
    // pause would read the old number under load. Wait for the requests the
    // click set off to finish instead.
    await page.waitForLoadState('networkidle').catch(() => {})
    await settled(page)

    return currentIncome(page)
}

/** The "إجمالي الإيراد" card, read as a number. */
async function currentIncome(page) {
    return page.evaluate(() => {
        const card = [...document.querySelectorAll('.card')].find((c) =>
            c.innerText.includes('إجمالي الإيراد'),
        )

        return card ? Number(card.innerText.replace(/[^\d.-]/g, '')) : NaN
    })
}
