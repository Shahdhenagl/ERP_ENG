import { chromium } from 'playwright'

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

/** What survives into the printed sheet — nav and buttons must not. */
async function printedText(page) {
    return page.evaluate(() => {
        const sheet = document.querySelector('.doc-sheet')

        return sheet ? sheet.innerText : ''
    })
}

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'manager@cityeng.local')

/* ── Find real records to print ──────────────────────────── */

const ids = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const get = async (url) =>
        (await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()

    // Raise and issue an invoice so there is a real one to print.
    const customers = await get('/api/customers?per_page=1')
    const customerId = customers.data[0].id

    const created = await fetch('/api/invoices', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            customer_id: customerId,
            tax_rate: 14,
            lines: [
                { description: 'صيانة دورية', qty: 1, unit_price: 2500 },
                { description: 'بطارية 100Ah', qty: 4, unit_price: 1400 },
            ],
        }),
    }).then((r) => r.json())

    await fetch(`/api/invoices/${created.id}/issue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })

    const quotations = await get('/api/quotations')
    const tasks = await get('/api/tasks?status=completed')

    return {
        customerId,
        invoiceId: created.id,
        quotationId: quotations.data[0]?.id,
        taskId: tasks.data[0]?.id,
    }
})

check('an issued invoice exists to print', Boolean(ids.invoiceId))
check('a quotation exists to print', Boolean(ids.quotationId))
check('a completed job exists to print', Boolean(ids.taskId))

/* ── Invoice ─────────────────────────────────────────────── */

await page.goto(`${BASE}/manager/print/invoices/${ids.invoiceId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.doc-sheet', { timeout: 20000 })
await settled(page)

const invoice = await printedText(page)
check('invoice carries the letterhead', invoice.includes('City Engineering'))
check('invoice carries the tax number', invoice.includes('512-874-336'))
check('invoice lists its lines', invoice.includes('صيانة دورية'))
// 2500 + 5600 = 8100, + 14% = 9234
check('invoice totals with VAT', invoice.includes('9,234.00'))
check('invoice has a signature strip', invoice.includes('استلم العميل'))
check('invoice carries the footer note', invoice.includes('يُرجى السداد'))

/* ── Quotation ───────────────────────────────────────────── */

await page.goto(`${BASE}/manager/print/quotations/${ids.quotationId}`, {
    waitUntil: 'domcontentloaded',
})
await page.waitForSelector('.doc-sheet', { timeout: 20000 })
await settled(page)

const quotation = await printedText(page)
check('quotation renders', quotation.includes('عرض سعر'))
check('quotation states its validity', quotation.includes('صالح حتى'))
check('quotation carries terms', quotation.includes('الشروط والأحكام'))

/* ── Service report ──────────────────────────────────────── */

await page.goto(`${BASE}/print/tasks/${ids.taskId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.doc-sheet', { timeout: 20000 })
await settled(page)

const report = await printedText(page)
check('service report renders', report.includes('تقرير زيارة فنية'))
check('service report names the technician', report.includes('الفني'))
check('service report carries readings', report.includes('جهد الدخول'))

/* ── Customer statement ──────────────────────────────────── */

await page.goto(`${BASE}/manager/print/statements/${ids.customerId}`, {
    waitUntil: 'domcontentloaded',
})
await page.waitForSelector('.doc-sheet', { timeout: 20000 })
await settled(page)

const statement = await printedText(page)
check('statement renders', statement.includes('كشف حساب عميل'))
check('statement shows the balance', statement.includes('الرصيد المستحق'))
check('statement lists the invoice just raised', statement.includes('INV-'))

/* ── Chrome is hidden when printing ──────────────────────── */

const chromeHidden = await page.evaluate(() => {
    const controls = document.querySelector('.no-print')

    if (!controls) return false

    // The rule only applies in print, so ask the browser directly.
    return [...document.styleSheets]
        .flatMap((sheet) => {
            try {
                return [...sheet.cssRules]
            } catch {
                return []
            }
        })
        .some(
            (rule) =>
                rule.conditionText?.includes('print') &&
                [...(rule.cssRules ?? [])].some((r) => r.selectorText?.includes('.no-print')),
        )
})

check('print stylesheet hides the controls', chromeHidden)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()

/* ── A technician can print their own report, nothing else ─ */

// A separate context, because a technician is a different person on a
// different phone — and because reusing this one would leave the manager's
// service worker serving its cached shell to them.
{
    const techContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: 'ar-EG',
    })
    const techPage = await techContext.newPage()

    await login(techPage, 'tech1@cityeng.local')

    await techPage.goto(`${BASE}/print/tasks/${ids.taskId}`, { waitUntil: 'domcontentloaded' })
    await techPage.waitForSelector('.doc-sheet', { timeout: 20000 }).catch(() => {})
    check(
        'technician can print a service report',
        (await printedText(techPage)).includes('تقرير زيارة فنية'),
    )

    await techPage.goto(`${BASE}/manager/print/invoices/${ids.invoiceId}`, {
        waitUntil: 'domcontentloaded',
    })
    const bounced = await techPage
        .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
        .then(() => true)
        .catch(() => false)
    check('technician is kept away from invoices', bounced)

    await techContext.close()
}
await browser.close()

console.log(failures === 0 ? '\ndocuments work ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
