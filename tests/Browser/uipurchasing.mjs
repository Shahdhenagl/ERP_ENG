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
    await page.waitForTimeout(500)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'manager@cityeng.local')

/* ── Suppliers exist and carry a balance ─────────────────── */

await page.goto(`${BASE}/manager/purchasing`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=أوامر الشراء', { timeout: 20000 })
await settled(page)

const orders = await page.locator('body').innerText()
check('purchasing lists the seeded order', orders.includes('PO-'))
check('order shows partial delivery', orders.includes('استلام جزئي'))

await page.getByText('الموردون', { exact: true }).click()
await settled(page)

const suppliers = await page.locator('body').innerText()
check('suppliers are records now', suppliers.includes('النور للبطاريات'))
check('supplier carries what is owed', suppliers.includes('المستحق'))

/* ── Receiving the rest of an order ──────────────────────── */

const state = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const get = async (url) =>
        (await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()

    const list = await get('/api/purchase-orders?open=1')
    const order = await get(`/api/purchase-orders/${list.data[0].id}`)
    const items = await get('/api/items?per_page=200')

    const line = order.data.lines.find((l) => l.outstanding > 0)

    return {
        orderId: order.data.id,
        itemId: line.item_id,
        outstanding: line.outstanding,
        stockBefore: items.data.find((i) => i.id === line.item_id).total_qty,
    }
})

check(`order has an outstanding line — ${state.outstanding}`, state.outstanding > 0)

// Over-receipt must be refused by the API, not absorbed.
const over = await page.evaluate(async (s) => {
    const token = localStorage.getItem('ce.token')
    const res = await fetch(`/api/purchase-orders/${s.orderId}/receive`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lines: [{ item_id: s.itemId, qty: s.outstanding + 5 }] }),
    })

    return res.status
}, state)

check(`over-receipt refused — ${over}`, over === 422)

// And the good delivery goes through, through the UI. Straight to the orders
// section — the tab lives in the URL now, so a reload would have kept us on
// suppliers where the receive button is not.
await page.goto(`${BASE}/manager/purchasing/orders`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=أوامر الشراء', { timeout: 20000 })
await settled(page)

// The list opens the order; the delivery is confirmed against its lines.
await page.getByRole('button', { name: 'تسجيل استلام' }).first().click()
await page.waitForSelector('text=طُلب', { timeout: 20000 })
await page.getByRole('button', { name: 'تسجيل استلام' }).last().click()
await page.waitForSelector('text=قيمة الاستلام', { timeout: 20000 })

const received = page.waitForResponse(
    (r) => r.url().includes('/receive') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await page.getByRole('button', { name: 'تسجيل الاستلام' }).click()
const response = await received
check(`delivery booked — ${response.status()}`, response.status() === 201)

await page.waitForTimeout(2500)

const after = await page.evaluate(async (s) => {
    const token = localStorage.getItem('ce.token')
    const res = await fetch('/api/items?per_page=200', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    const body = await res.json()

    return body.data.find((i) => i.id === s.itemId).total_qty
}, state)

check(`stock rose ${state.stockBefore} → ${after}`, after > state.stockBefore)

/* ── A technician sees none of it ────────────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/purchasing`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is kept out of purchasing', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\npurchasing works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
