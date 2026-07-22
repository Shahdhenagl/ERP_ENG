import { chromium } from 'playwright'

/**
 * Sales returns end to end.
 *
 * The checks that matter are the ones tying the credit note to everything it
 * touches at once: the invoice owes less, the shelf holds more, the customer's
 * statement shows why, and none of it happens while the note is still a draft.
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

/** The invoice as the API reports it right now. */
async function invoiceState(page, id) {
    return page.evaluate(async (invoiceId) => {
        const token = localStorage.getItem('ce.token')
        const body = await (
            await fetch(`/api/invoices/${invoiceId}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            })
        ).json()

        return {
            balance: Number(body.data.balance),
            credited: Number(body.data.credited_total),
            state: body.data.payment_state,
        }
    }, id)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'manager@cityeng.local')

/* ── Sell something with stock on it ─────────────────────── */

const setup = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const get = async (url) => (await fetch(url, { headers })).json()
    const post = async (url, body) =>
        (await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).json()

    const [customers, items] = await Promise.all([
        get('/api/customers?per_page=1'),
        get('/api/items?per_page=1'),
    ])

    const item = items.data[0]

    // Stock it first so there is a shelf level to watch move.
    await post('/api/stock/receive', { item_id: item.id, qty: 20, unit_cost: 400 })

    const invoice = await post('/api/invoices', {
        customer_id: customers.data[0].id,
        tax_rate: 14,
        lines: [
            { item_id: item.id, description: item.name, qty: 4, unit_price: 1000 },
            { description: 'أجر زيارة', qty: 1, unit_price: 500 },
        ],
    })

    const id = invoice.data?.id ?? invoice.id
    await post(`/api/invoices/${id}/issue`, {})

    const levels = await get(`/api/items?per_page=100`)
    const stocked = levels.data.find((row) => row.id === item.id)

    return {
        invoiceId: id,
        invoiceCode: invoice.data?.code ?? invoice.code,
        itemId: item.id,
        itemName: item.name,
        qtyBefore: Number(stocked.total_qty),
        customer: customers.data[0].name,
    }
})

check(`sold on ${setup.invoiceCode}`, Boolean(setup.invoiceId))

// Four batteries at 1,000 plus a 500 visit fee, all at 14%.
const invoiceTotal = (4 * 1000 + 500) * 1.14

const beforeReturn = await invoiceState(page, setup.invoiceId)
check(
    `the invoice is owed in full — ${beforeReturn.balance}`,
    Math.abs(beforeReturn.balance - invoiceTotal) < 0.01,
)

/* ── Draft a credit note ─────────────────────────────────── */

await page.goto(`${BASE}/manager/sales`, { waitUntil: 'domcontentloaded' })
await settled(page)

await page.getByRole('button', { name: 'المرتجعات' }).click()
await page.waitForTimeout(800)

await page.getByRole('button', { name: 'مرتجع مبيعات' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(1000)

const dialog = page.locator('[role=dialog]')
await dialog.locator('select').first().selectOption(String(setup.invoiceId))

check('the form lists the returnable lines', await sees(page, 'البنود القابلة للإرجاع'))
check('it shows what is still available', await sees(page, 'متاح'))

await dialog.locator('input[type=text], input:not([type]):not([type=number]):not([type=checkbox])')
    .first()
    .fill('بطاريتان معيبتان')

// Return two of the four batteries.
await dialog.locator('input[type=number]').first().fill('2')
await page.waitForTimeout(500)

check('the tax being refunded is spelled out', await sees(page, 'ضريبة مردودة'))

const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/sales-returns') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await dialog.getByRole('button', { name: 'حفظ كمسودة' }).click()
const createResponse = await created
check(`credit note drafted — ${createResponse.status()}`, createResponse.status() === 201)

const noteCode = (await createResponse.json()).data.code
check('the draft is listed', await sees(page, noteCode))

/* ── A draft moves nothing ───────────────────────────────── */

const whileDraft = await invoiceState(page, setup.invoiceId)
check(
    `a draft leaves the invoice alone — ${whileDraft.balance}`,
    whileDraft.balance === beforeReturn.balance && whileDraft.credited === 0,
)

/* ── Posting it moves everything ─────────────────────────── */

const posted = page.waitForResponse(
    (r) => r.url().includes('/sales-returns/') && r.url().includes('/post'),
    { timeout: 20000 },
)
await page.getByRole('button', { name: 'ترحيل', exact: true }).first().click()
check(`credit note posted — ${(await posted).status()}`, (await posted).status() === 200)

await settled(page)

const afterReturn = await invoiceState(page, setup.invoiceId)

// Two batteries at 1,000 plus 14% — the tax charged, not today's rate.
check(
    `the invoice is credited 2,280 — ${afterReturn.credited}`,
    Math.abs(afterReturn.credited - 2280) < 0.01,
)
check(
    `and owes that much less — ${beforeReturn.balance} → ${afterReturn.balance}`,
    Math.abs(beforeReturn.balance - afterReturn.balance - 2280) < 0.01,
)

const stockNow = await page.evaluate(async (itemId) => {
    const token = localStorage.getItem('ce.token')
    const body = await (
        await fetch('/api/items?per_page=100', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
    ).json()

    return Number(body.data.find((row) => row.id === itemId).total_qty)
}, setup.itemId)

check(
    `the goods are back on the shelf — ${setup.qtyBefore} → ${stockNow}`,
    Math.abs(stockNow - setup.qtyBefore - 2) < 0.001,
)

/* ── The invoice and the statement explain themselves ────── */

await page.goto(`${BASE}/manager/invoices/${setup.invoiceId}`, { waitUntil: 'domcontentloaded' })
await settled(page)

check('the invoice states the credit', await sees(page, 'مرتجع'))

const statement = await page.evaluate(async (customerName) => {
    const token = localStorage.getItem('ce.token')
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    const customers = await (await fetch('/api/customers?per_page=1', { headers })).json()
    const body = await (
        await fetch(`/api/customers/${customers.data[0].id}/statement`, { headers })
    ).json()

    return {
        hasCredit: body.data.some((row) => row.type === 'credit'),
        name: customerName,
    }
}, setup.customer)

check('the customer statement carries the credit note', statement.hasCredit)

/* ── The guard holds ─────────────────────────────────────── */

const overReturn = await page.evaluate(async (invoiceId) => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }

    const returnable = await (
        await fetch(`/api/invoices/${invoiceId}/returnable`, { headers })
    ).json()

    const line = returnable.lines[0]

    // Ask for more than the two that are left.
    const response = await fetch('/api/sales-returns', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            invoice_id: invoiceId,
            reason: 'محاولة إرجاع زائد',
            lines: [{ invoice_line_id: line.invoice_line_id, qty: line.remaining + 5 }],
        }),
    })

    return { status: response.status, remaining: line.remaining }
}, setup.invoiceId)

check(`only 2 are still returnable — ${overReturn.remaining}`, overReturn.remaining === 2)
check(`returning more is refused — ${overReturn.status}`, overReturn.status === 422)

/* ── A technician has no business here ───────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/sales`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is bounced out of sales', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\ncredit notes work ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
