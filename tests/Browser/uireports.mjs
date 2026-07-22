import { chromium } from 'playwright'

/**
 * The six reports, the period that binds them, and the export.
 *
 * The check worth having is the one that ties a report back to its source: the
 * profit report's revenue has to equal the income statement's, because it is
 * read from it rather than summed again.
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

/** Wait for text rather than a fixed pause — the dev server runs one worker. */
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

const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    locale: 'ar-EG',
    acceptDownloads: true,
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// Only an admin gets the sidebar, and the nesting is checked first.
await login(page, 'admin@cityeng.local')

/* ── The sidebar carries it ──────────────────────────────── */

await page.goto(`${BASE}/manager`, { waitUntil: 'domcontentloaded' })
await settled(page)

const parent = page.locator('aside a[href="/manager/reports"]').first()
check('التقارير is in the sidebar', await parent.isVisible())
check(
    'its sections are nested under it',
    await page.locator('aside a[href="/manager/reports/sales"]').first().isVisible(),
)

/* ── Sales ───────────────────────────────────────────────── */

await parent.click()
await page.waitForURL(/\/manager\/reports\/sales$/, { timeout: 20000 })
await settled(page)

check('the sales report opens', await sees(page, 'إجمالي المبيعات'))
check('it separates collected from outstanding', await sees(page, 'المتبقي على العملاء'))
check('it ranks the customers', await sees(page, 'أكبر العملاء'))
check('a period picker applies to it', await page.locator('input[type=date]').first().isVisible())

/* ── Profit, against the books it reads from ─────────────── */

await page.locator('aside a[href="/manager/reports/profit"]').first().click()
await page.waitForURL(/\/manager\/reports\/profit$/, { timeout: 20000 })
await settled(page)

check('the profit report opens', await sees(page, 'مجمل الربح'))
check('it says where its figures come from', await sees(page, 'مقروءة من قائمة الدخل'))

// The claim the screen makes, verified against the accounting endpoint over
// the same window. An invoice is issued first so the two are compared on a
// real figure — zero equalling zero would prove nothing.
const agreement = await page.evaluate(async () => {
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

    const invoice = await post('/api/invoices', {
        customer_id: customers.data[0].id,
        lines: [{ description: 'تقرير الأرباح', qty: 1, unit_price: 7500 }],
    })

    await post(`/api/invoices/${invoice.data?.id ?? invoice.id}/issue`, {})

    const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const iso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`

    const [report, statement] = await Promise.all([
        get(`/api/reports/profitability?from=${iso}`),
        get(`/api/accounting/income-statement?from=${iso}`),
    ])

    return {
        report: Number(report.data.revenue),
        books: Number(statement.data?.revenue_total ?? statement.revenue_total),
    }
})

check(`the comparison is on a real figure — ${agreement.report}`, agreement.report > 0)

check(
    `profit revenue equals the income statement — ${agreement.report} vs ${agreement.books}`,
    Math.abs(agreement.report - agreement.books) < 0.01,
)

/* ── Stock, custody, contracts, warranties ───────────────── */

await page.locator('aside a[href="/manager/reports/stock"]').first().click()
await page.waitForURL(/\/manager\/reports\/stock$/, { timeout: 20000 })
await settled(page)

check('the stock report opens', await sees(page, 'قيمة المخزون'))
check('it surfaces idle stock', await sees(page, 'مخزون راكد'))
check('the period picker is hidden where it means nothing', (await page.locator('input[type=date]').count()) === 0)

await page.locator('aside a[href="/manager/reports/custody"]').first().click()
await page.waitForURL(/\/manager\/reports\/custody$/, { timeout: 20000 })
await settled(page)
check('the custody report opens', await sees(page, 'إجمالي العهد'))

// Contracts and warranties are reached from the section strip, which is what a
// manager without a sidebar uses.
await page.goto(`${BASE}/manager/reports/contracts`, { waitUntil: 'domcontentloaded' })
await settled(page)
check('the contract report opens', await sees(page, 'الالتزام بخطة الزيارات'))

await page.goto(`${BASE}/manager/reports/warranties`, { waitUntil: 'domcontentloaded' })
await settled(page)
check('the warranty report opens', await sees(page, 'تكلفة أعمال الضمان'))

/* ── Export ──────────────────────────────────────────────── */

await page.goto(`${BASE}/manager/reports/sales`, { waitUntil: 'domcontentloaded' })
await settled(page)

const download = page.waitForEvent('download', { timeout: 25000 })
await page.getByRole('button', { name: 'تصدير Excel' }).click()
const file = await download

check(`the export downloads — ${file.suggestedFilename()}`, file.suggestedFilename().endsWith('.csv'))

/* ── A technician sees none of it ────────────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/reports/sales`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is bounced out of the reports', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\nreports work ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
