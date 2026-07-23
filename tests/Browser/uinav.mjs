import { chromium } from 'playwright'

/**
 * The sidebar folds; nothing is lost in the fold.
 *
 * An admin gets a sidebar of collapsible groups — a header per module, its
 * sections tucked inside until the group is opened. A manager gets no sidebar
 * at all and reaches the same sections from the strip each page carries. This
 * suite proves a group opens onto its sections, a section opens from the
 * sidebar, and a manager still reaches everything the admin can.
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

/** Every visible in-area link, as hrefs. */
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

/* ── The admin sidebar folds modules into groups ─────────── */

await login(page, 'admin@cityeng.local')
await page.goto(`${BASE}/manager`, { waitUntil: 'domcontentloaded' })
await settled(page)

// Group headers are buttons; a group holds its sections folded away.
const groups = await page.evaluate(() =>
    [...document.querySelectorAll('aside nav button')].map((b) => b.innerText.trim()),
)
check(
    'modules are grouped under headers',
    groups.some((g) => g.includes('إدارة العملاء')) &&
        groups.some((g) => g.includes('المبيعات')) &&
        groups.some((g) => g.includes('الموارد البشرية')),
)

// A collapsed group keeps its sections out of the DOM/off-screen.
const salesHidden = await page.evaluate(() => {
    const a = document.querySelector('aside a[href="/manager/sales/orders"]')
    return !a || a.offsetParent === null
})
check('a collapsed group hides its sections', salesHidden)

// Opening a group reveals its sections.
await page.getByRole('button', { name: 'المبيعات', exact: true }).click()
const salesShown = await page
    .waitForSelector('aside a[href="/manager/sales/orders"]', { state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false)
check('opening a group reveals its sections', salesShown)

// A section opens from the sidebar.
await page.getByRole('link', { name: 'أوامر البيع' }).click()
await page.waitForTimeout(600)
check('a section opens straight from the sidebar', page.url().includes('/manager/sales/orders'))

// Customers and leads share one group now.
await page.getByRole('button', { name: 'إدارة العملاء', exact: true }).click()
await page.waitForTimeout(400)
const customerGroup = await linksOn(page)
check(
    'customers and leads live in one group',
    customerGroup.includes('/manager/customers') && customerGroup.includes('/manager/crm'),
)

/* ── A manager keeps every section, via the strips ───────── */

await login(page, 'manager@cityeng.local')

check('a manager still gets no sidebar', (await page.locator('aside').count()) === 0)

// The device group's sections, from the strip on the assets page.
await page.goto(`${BASE}/manager/assets`, { waitUntil: 'domcontentloaded' })
await settled(page)
const fromAssets = await linksOn(page)
check('عقود الصيانة is reachable from الأجهزة', fromAssets.includes('/manager/contracts'))
check('الضمانات is reachable from الأجهزة', fromAssets.includes('/manager/warranties'))

// The money group's sections.
await page.goto(`${BASE}/manager/invoices`, { waitUntil: 'domcontentloaded' })
await settled(page)
const fromInvoices = await linksOn(page)
check('الخزينة is reachable from المالية', fromInvoices.includes('/manager/treasury'))
check('المحاسبة is reachable from المالية', fromInvoices.includes('/manager/accounting'))

// The sales group's sections, from the strip.
await page.goto(`${BASE}/manager/sales`, { waitUntil: 'domcontentloaded' })
await settled(page)
const fromSales = await linksOn(page)
check('a manager reaches the sales sections', fromSales.includes('/manager/sales/returns'))

/* ── Every grouped section still opens ────────────────────── */

for (const [path, marker] of [
    ['/manager/customers', 'العملاء'],
    ['/manager/crm', 'العملاء المحتملون'],
    ['/manager/sales/orders', 'أوامر البيع'],
    ['/manager/purchasing/suppliers', 'الموردون'],
    ['/manager/contracts', 'عقود الصيانة'],
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
