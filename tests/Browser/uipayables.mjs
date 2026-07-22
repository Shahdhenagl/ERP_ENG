import { chromium } from 'playwright'

/**
 * Supplier bills and purchase returns end to end.
 *
 * The check that matters most is the one that looks least dramatic: billing a
 * delivery must not move the supplier's balance, because the goods were owed
 * for the moment they arrived. Doubling that is the most expensive mistake
 * this module could make, and it would look perfectly reasonable on screen.
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

/** Wait for text rather than for a fixed pause — the dev server runs one worker. */
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

/** Whatever the API says the supplier is owed right now. */
async function balanceOf(page, supplierId) {
    return page.evaluate(async (id) => {
        const token = localStorage.getItem('ce.token')
        const response = await fetch(`/api/suppliers/${id}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
        const body = await response.json()

        return {
            balance: Number(body.data.balance),
            uninvoiced: Number(body.data.uninvoiced_total),
        }
    }, supplierId)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'manager@cityeng.local')

/* ── Receive goods so there is something to bill ─────────── */

const setup = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const get = async (url) => (await fetch(url, { headers })).json()

    const [suppliers, items] = await Promise.all([
        get('/api/suppliers?per_page=5'),
        get('/api/items?per_page=5'),
    ])

    const supplier = suppliers.data[0]
    const item = items.data[0]

    // Straight through the stock API: the point of this suite is what happens
    // to the debt afterwards, not the receiving screen.
    await fetch('/api/stock/receive', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            item_id: item.id,
            qty: 10,
            unit_cost: 500,
            supplier_id: supplier.id,
        }),
    })

    return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        itemId: item.id,
        itemName: item.name,
    }
})

check(`received goods from ${setup.supplierName}`, Boolean(setup.supplierId))

const afterReceipt = await balanceOf(page, setup.supplierId)
check(`the delivery is owed for immediately — ${afterReceipt.balance}`, afterReceipt.balance >= 5000)
check(
    `and shows as uninvoiced — ${afterReceipt.uninvoiced}`,
    afterReceipt.uninvoiced >= 5000,
)

/* ── Bill it ─────────────────────────────────────────────── */

await page.goto(`${BASE}/manager/purchasing`, { waitUntil: 'domcontentloaded' })
await settled(page)

await page.getByRole('button', { name: 'فواتير الموردين' }).click()
await page.waitForTimeout(800)

await page.getByRole('button', { name: 'فاتورة مورّد' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(1000)

const dialog = page.locator('[role=dialog]')
await dialog.locator('select').first().selectOption(String(setup.supplierId))

// The uninvoiced deliveries load once a supplier is chosen.
check('the bill form lists the uninvoiced delivery', await sees(page, 'استلامات بلا فاتورة'))

await dialog.locator('input[type=checkbox]').first().check()
check('choosing it explains the goods are already on the account', await sees(page, 'محمّلة على حساب المورّد'))

const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/supplier-invoices') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await dialog.getByRole('button', { name: 'حفظ كمسودة' }).click()
const createResponse = await created
check(`bill drafted — ${createResponse.status()}`, createResponse.status() === 201)

const billCode = (await createResponse.json()).data.code
check('the draft is listed', await sees(page, billCode))

const posted = page.waitForResponse((r) => r.url().includes('/post'), { timeout: 20000 })
await page.getByRole('button', { name: 'ترحيل', exact: true }).first().click()
check(`bill posted — ${(await posted).status()}`, (await posted).status() === 200)

await settled(page)

/* ── The balance must not have doubled ───────────────────── */

const afterBill = await balanceOf(page, setup.supplierId)
check(
    `billing the delivery did not change the debt — ${afterReceipt.balance} → ${afterBill.balance}`,
    Math.abs(afterBill.balance - afterReceipt.balance) < 0.01,
)
check(
    `the billed delivery left the uninvoiced pile — ${afterReceipt.uninvoiced} → ${afterBill.uninvoiced}`,
    Math.abs(afterReceipt.uninvoiced - afterBill.uninvoiced - 5000) < 0.01,
)

/* ── Return part of it ───────────────────────────────────── */

await page.getByRole('button', { name: 'المرتجعات' }).click()
await page.waitForTimeout(800)

await page.getByRole('button', { name: 'مرتجع مشتريات' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(1000)

const returnDialog = page.locator('[role=dialog]')
await returnDialog.locator('select').first().selectOption(String(setup.supplierId))
await returnDialog.locator('input:not([type=date]):not([type=number])').first().fill('بطاريات معيبة')

// The item select is the third one: supplier, warehouse, then the line.
await returnDialog.locator('select').nth(2).selectOption(String(setup.itemId))
await returnDialog.locator('input[type=number]').first().fill('2')

const draftedReturn = page.waitForResponse(
    (r) => r.url().endsWith('/api/purchase-returns') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await returnDialog.getByRole('button', { name: 'حفظ كمسودة' }).click()
const returnResponse = await draftedReturn
check(`return drafted — ${returnResponse.status()}`, returnResponse.status() === 201)

const returned = (await returnResponse.json()).data
const returnCode = returned.code
// Priced at the weighted average the stock is carried at, not at what this
// particular delivery cost — so the expected drop comes from the document
// rather than from arithmetic on the receipt.
const returnTotal = Number(returned.total)
check('the draft return is listed', await sees(page, returnCode))

// Nothing has left the shelf yet.
const beforePosting = await balanceOf(page, setup.supplierId)
check(
    `a draft return moves nothing — ${beforePosting.balance}`,
    Math.abs(beforePosting.balance - afterBill.balance) < 0.01,
)

const postedReturn = page.waitForResponse(
    (r) => r.url().includes('/purchase-returns/') && r.url().includes('/post'),
    { timeout: 20000 },
)
await page.getByRole('button', { name: 'ترحيل وإخراج البضاعة' }).first().click()
check(`return posted — ${(await postedReturn).status()}`, (await postedReturn).status() === 200)

await settled(page)

const afterReturn = await balanceOf(page, setup.supplierId)
check(
    `the return took its own value off the debt — ${afterBill.balance} → ${afterReturn.balance} (${returnTotal})`,
    Math.abs(afterBill.balance - afterReturn.balance - returnTotal) < 0.01,
)

/* ── The statement reads back the same balance ───────────── */

await page.getByRole('button', { name: 'الموردون' }).click()
await page.waitForTimeout(1000)
await settled(page)

await page.getByRole('button', { name: 'كشف حساب' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })

check('the statement opens', await sees(page, 'رصيد أول المدة'))
check('it shows the goods received', await sees(page, 'استلام بضاعة'))
check('it shows the bill', await sees(page, 'فاتورة مورّد'))
check('it shows the return', await sees(page, 'مرتجع مشتريات'))

/* ── A technician has no business here ───────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/purchasing`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is bounced out of purchasing', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\npayables work ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
