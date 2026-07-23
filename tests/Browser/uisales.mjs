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

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'manager@cityeng.local')

/* ── The list shows both seeded states ───────────────────── */

await page.goto(`${BASE}/manager/sales`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=عروض الأسعار', { timeout: 20000 })
await settled(page)

const quotations = await page.locator('body').innerText()
check('sales page lists quotations', quotations.includes('QT-'))
check('shows one still awaiting a reply', quotations.includes('مُرسَل'))
check('shows the one that was won', quotations.includes('مقبول'))
check('links the won quote to its order', /←\s*SO-/.test(quotations))

// The tab, not the label wherever else it appears — the module gained a
// returns tab and a text match alone is no longer unambiguous.
await page.getByRole('link', { name: 'أوامر البيع', exact: true }).click()
await page.waitForFunction(() => document.body.innerText.includes('SO-'), null, { timeout: 25000 })
    .catch(() => {})
await settled(page)

const orders = await page.locator('body').innerText()
check('orders tab lists the converted order', orders.includes('SO-'))
check('order is flagged as not yet invoiced', orders.includes('لم تتم فوترته'))

/* ── Accepting a quote creates an order ──────────────────── */

const before = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const res = await fetch('/api/sales-orders', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })

    return (await res.json()).data.length
})

await page.getByText('عروض الأسعار', { exact: true }).click()
await settled(page)

// Open the quotation that is still out with the customer.
await page.locator('button.card-interactive', { hasText: 'مُرسَل' }).first().click()
await page.waitForSelector('text=العميل وافق', { timeout: 20000 })

const accepted = page.waitForResponse(
    (r) => r.url().includes('/accept') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await page.getByRole('button', { name: 'العميل وافق' }).click()
const acceptResponse = await accepted
check(`acceptance recorded — ${acceptResponse.status()}`, acceptResponse.status() === 201)

await page.waitForTimeout(2000)

const after = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const res = await fetch('/api/sales-orders', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    const body = await res.json()

    return { count: body.data.length, newest: body.data[0] }
})

check(`orders grew ${before} → ${after.count}`, after.count === before + 1)
check('new order carries the quoted total', after.newest.total > 0)
check('new order points back at its quotation', Boolean(after.newest.quotation_code))

/* ── A lapsed quote cannot be accepted ───────────────────── */

const lapsed = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }

    // Raise one, send it, then let its validity fall in the past.
    const created = await (
        await fetch('/api/quotations', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                customer_id: 1,
                title: 'عرض منتهي',
                valid_until: '2020-01-01',
                lines: [{ description: 'بند', qty: 1, unit_price: 100 }],
            }),
        })
    ).json()

    await fetch(`/api/quotations/${created.data.id}/send`, { method: 'POST', headers })

    const read = await (await fetch(`/api/quotations/${created.data.id}`, { headers })).json()
    const accept = await fetch(`/api/quotations/${created.data.id}/accept`, { method: 'POST', headers })

    return { effective: read.data.effective_status, acceptStatus: accept.status }
})

check(`lapsed quote reads as expired — ${lapsed.effective}`, lapsed.effective === 'expired')
check(`accepting a lapsed quote refused — ${lapsed.acceptStatus}`, lapsed.acceptStatus === 422)

/* ── Order becomes an invoice ────────────────────────────── */

await page.goto(`${BASE}/manager/sales`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=عروض الأسعار', { timeout: 20000 })
// The tab, not the label wherever else it appears — the module gained a
// returns tab and a text match alone is no longer unambiguous.
await page.getByRole('link', { name: 'أوامر البيع', exact: true }).click()
await page.waitForFunction(() => document.body.innerText.includes('SO-'), null, { timeout: 25000 })
    .catch(() => {})
await settled(page)

// Scoped to the card, since the same words label the filter chip above it.
await page.locator('button.card-interactive', { hasText: 'SO-' }).first().click()
await page.waitForSelector('text=إنشاء فاتورة', { timeout: 20000 })

const invoiced = page.waitForResponse(
    (r) => r.url().includes('/invoice') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await page.getByRole('button', { name: 'إنشاء فاتورة' }).click()
const invoiceResponse = await invoiced
check(`invoice drafted — ${invoiceResponse.status()}`, invoiceResponse.status() === 201)

const invoice = await invoiceResponse.json()
check('invoice starts as a draft', invoice.status === 'draft')
check('invoice carries the order total', invoice.total > 0)

/* ── A technician sees none of it ────────────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/sales`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is kept out of sales', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\nsales works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
