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

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// The admin is the role that gets the sidebar, which is what this tests.
await login(page, 'admin@cityeng.local')

/* ── The sidebar nests the sections under المخزون ────────── */

await page.goto(`${BASE}/manager/inventory`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=قيمة المخزون', { timeout: 20000 })
await settled(page)

check('index lands on items', page.url().endsWith('/inventory/items'))

const sidebar = page.locator('aside').first()
for (const label of ['الأصناف', 'المخازن', 'العهد', 'سجل الحركة']) {
    check(`sidebar has ${label}`, (await sidebar.getByRole('link', { name: label }).count()) > 0)
}

/* ── Each section is its own page ────────────────────────── */

for (const [section, marker] of [
    ['items', 'تحت حد الطلب'],
    ['warehouses', 'مخزن جديد'],
    ['custody', 'تسليم جهاز'],
    ['movements', 'وارد'],
]) {
    await page.goto(`${BASE}/manager/inventory/${section}`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    check(`${section} renders`, (await page.locator('body').innerText()).includes(marker))
}

/* ── A second named store ────────────────────────────────── */

await page.goto(`${BASE}/manager/inventory/warehouses`, { waitUntil: 'domcontentloaded' })
await settled(page)

await page.getByRole('button', { name: 'مخزن جديد' }).click()
await page.waitForSelector('text=اسم المخزن', { timeout: 20000 })

const dialog = page.locator('[role=dialog]').last()
await dialog.locator('input').first().fill('مخزن الإسكندرية')

const stored = page.waitForResponse(
    (r) => r.url().includes('/api/warehouses') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await dialog.getByRole('button', { name: 'حفظ' }).click()
check(`store opened — ${(await stored).status()}`, (await stored).status() === 201)

await page.waitForTimeout(1500)
check('new store is listed', (await page.locator('body').innerText()).includes('مخزن الإسكندرية'))

/* ── Cash custody moves money without creating any ───────── */

const cash = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const get = async (url) => (await fetch(url, { headers })).json()

    // Put real money in the till the way the business does, so the advance
    // has something to draw on.
    const customers = await get('/api/customers?per_page=1')
    const invoice = await (
        await fetch('/api/invoices', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                customer_id: customers.data[0].id,
                lines: [{ description: 'رصيد افتتاحي', qty: 1, unit_price: 5000 }],
            }),
        })
    ).json()

    await fetch(`/api/invoices/${invoice.id}/issue`, { method: 'POST', headers })

    const boxesBefore = (await get('/api/treasury/boxes')).data
    const till = boxesBefore.find((b) => b.type !== 'custody')

    await fetch('/api/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify({ invoice_id: invoice.id, cash_box_id: till.id, amount: 5000 }),
    })

    const boxes = (await get('/api/treasury/boxes')).data
    const company = boxes.find((b) => b.type !== 'custody')
    const technicians = await get('/api/technicians')
    const technician = technicians.data?.[0] ?? technicians[0]

    const totalBefore = boxes.reduce((sum, b) => sum + b.balance, 0)
    const heldBefore =
        (await get(`/api/custody/${technician.id}`)).data.cash.balance

    const res = await fetch('/api/custody/cash', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            user_id: technician.id,
            cash_box_id: company.id,
            amount: 500,
            direction: 'advance',
        }),
    })

    const after = (await get('/api/treasury/boxes')).data
    const custodyBox = after.find((b) => b.type === 'custody')

    return {
        status: res.status,
        technician: technician.name,
        heldBefore,
        heldAfter: (await get(`/api/custody/${technician.id}`)).data.cash.balance,
        totalBefore: Math.round(totalBefore * 100) / 100,
        totalAfter: Math.round(after.reduce((sum, b) => sum + b.balance, 0) * 100) / 100,
    }
})

check(`advance recorded — ${cash.status}`, cash.status === 201)
check(
    `${cash.technician}: ${cash.heldBefore} → ${cash.heldAfter}`,
    Math.round((cash.heldAfter - cash.heldBefore) * 100) / 100 === 500,
)
// The money moved between boxes; the company is no richer or poorer.
check(
    `company total unchanged — ${cash.totalBefore} → ${cash.totalAfter}`,
    cash.totalBefore === cash.totalAfter,
)

/* ── Device custody, and one device in one pair of hands ── */

const device = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const get = async (url) => (await fetch(url, { headers })).json()

    const assets = (await get('/api/assets?per_page=20')).data
    const technicians = await get('/api/technicians')
    const list = technicians.data ?? technicians

    // The seed already has one device out; take one that is not.
    const held = new Set((await get('/api/custody/devices')).data.map((d) => d.asset_id))
    const free = assets.find((a) => !held.has(a.id))

    const take = async (userId) =>
        (
            await fetch('/api/custody/devices', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    asset_id: free.id,
                    user_id: userId,
                    reason: 'workshop_repair',
                }),
            })
        ).status

    const first = await take(list[0].id)
    // A second person cannot also be holding it.
    const second = await take(list[1].id)

    const custody = (await get('/api/custody')).data
    const holder = custody.find((c) => c.technician.id === list[0].id)

    return {
        first,
        second,
        holdsTheNewOne: Boolean(holder?.devices.some((d) => d.asset_id === free.id)),
    }
})

check(`device handover recorded — ${device.first}`, device.first === 201)
check(`second holder refused — ${device.second}`, device.second === 422)
check('custody statement lists the device', device.holdsTheNewOne)

/* ── The page shows all three forms together ─────────────── */

await page.goto(`${BASE}/manager/inventory/custody`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=إجمالي العهد المفتوحة', { timeout: 20000 })
await settled(page)

const custodyText = await page.locator('body').innerText()
check('custody page shows cash', custodyText.includes('نقدية'))
check('custody page shows stock', custodyText.includes('صنف'))
check('custody page shows devices', custodyText.includes('أجهزة'))

/* ── A technician sees none of it ────────────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/inventory/custody`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician kept out of the custody overview', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\ncustody works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
