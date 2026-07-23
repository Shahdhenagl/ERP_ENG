import { chromium } from 'playwright'

/**
 * Nothing is hidden by the grouping.
 *
 * Only an admin gets a sidebar. A manager navigates from the bottom bar, which
 * carries top-level destinations alone — so every module demoted to a child has
 * to be reachable from a section strip instead. Tidying the sidebar by making
 * four modules unreachable would look like an improvement and be a regression,
 * which is exactly why this suite exists.
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

async function settled(page) {
    await page
        .waitForFunction(
            () => !document.querySelector('.shimmer') && !document.querySelector('.animate-spin'),
            { timeout: 20000 },
        )
        .catch(() => {})
    await page.waitForTimeout(400)
}

/** Every destination the page offers, sidebar or strip, as hrefs. */
async function linksOn(page) {
    return page.evaluate(() =>
        [...document.querySelectorAll('a[href^="/manager"]')]
            .filter((a) => a.offsetParent !== null)
            .map((a) => a.getAttribute('href')),
    )
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

/* ── The admin sidebar is shorter than it was ────────────── */

await login(page, 'admin@cityeng.local')
await page.goto(`${BASE}/manager`, { waitUntil: 'domcontentloaded' })
await settled(page)

const topLevel = await page.evaluate(() =>
    [...document.querySelectorAll('aside > nav > div > a')].map((a) => a.innerText.trim()),
)

// The ceiling is a guard against sprawl, not a hard cap: a genuinely new
// top-level domain earns a row. HR — people and payroll — is the eleventh,
// the way inventory and sales each stand on their own.
check(`the sidebar carries ${topLevel.length} top-level entries`, topLevel.length <= 11)
check('الأجهزة is one of them', topLevel.includes('الأجهزة'))
check('الموارد البشرية earns its own row', topLevel.includes('الموارد البشرية'))
check('عقود الصيانة is not', !topLevel.includes('عقود الصيانة'))
check('المحاسبة المالية is not', !topLevel.includes('المحاسبة المالية'))

// Nested where they were promoted from.
const nested = await page.evaluate(() =>
    [...document.querySelectorAll('aside a')].map((a) => a.getAttribute('href')),
)

for (const href of [
    '/manager/contracts',
    '/manager/warranties',
    '/manager/treasury',
    '/manager/accounting',
    '/manager/settings',
]) {
    check(`${href} is still in the sidebar`, nested.includes(href))
}

// The last entry has to be clickable — the reason the nav scrolls at all.
const lastEntry = page.locator('aside > nav > div > a').last()
await lastEntry.click()
check('the last sidebar entry is reachable', !page.url().endsWith('/manager'))

/* ── A manager loses nothing ─────────────────────────────── */

await login(page, 'manager@cityeng.local')

await page.goto(`${BASE}/manager/assets`, { waitUntil: 'domcontentloaded' })
await settled(page)

check('a manager still gets no sidebar', (await page.locator('aside').count()) === 0)

const fromAssets = await linksOn(page)
check('عقود الصيانة is reachable from الأجهزة', fromAssets.includes('/manager/contracts'))
check('الضمانات is reachable from الأجهزة', fromAssets.includes('/manager/warranties'))

await page.goto(`${BASE}/manager/contracts`, { waitUntil: 'domcontentloaded' })
await settled(page)
const fromContracts = await linksOn(page)
check('the strip is on the contracts page too', fromContracts.includes('/manager/warranties'))

await page.goto(`${BASE}/manager/invoices`, { waitUntil: 'domcontentloaded' })
await settled(page)

const fromInvoices = await linksOn(page)
check('الخزينة is reachable from الفواتير', fromInvoices.includes('/manager/treasury'))
check('المحاسبة is reachable from الفواتير', fromInvoices.includes('/manager/accounting'))

await page.goto(`${BASE}/manager/treasury`, { waitUntil: 'domcontentloaded' })
await settled(page)
check(
    'and from الخزينة as well',
    (await linksOn(page)).includes('/manager/accounting'),
)

/* ── Every grouped module still opens ────────────────────── */

for (const [path, marker] of [
    ['/manager/contracts', 'عقود الصيانة'],
    ['/manager/warranties', 'الضمانات'],
    ['/manager/treasury', 'الخزينة'],
    ['/manager/accounting', 'المحاسبة'],
]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })

    const opened = await page
        .waitForFunction((t) => document.body.innerText.includes(t), marker, { timeout: 25000 })
        .then(() => true)
        .catch(() => false)

    check(`${path} still opens`, opened)
}

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\nnavigation holds ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
