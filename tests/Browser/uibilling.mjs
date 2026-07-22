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

/* ── Bill a finished job ─────────────────────────────────── */

// A job can only be billed once, so pick one that has not been — otherwise a
// second run of this file would fail on the guard rather than on a defect.
const taskId = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const get = async (url) =>
        (await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()

    const [tasks, invoices] = await Promise.all([
        get('/api/tasks?status=completed&per_page=50'),
        get('/api/invoices?per_page=100'),
    ])

    const billed = new Set(invoices.data.map((i) => i.task_id).filter(Boolean))

    return tasks.data.find((t) => !billed.has(t.id))?.id ?? null
})

check(`found a completed job — #${taskId}`, Boolean(taskId))

await page.goto(`${BASE}/manager/tasks/${taskId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=الفوترة', { timeout: 20000 })
await settled(page)

const created = page.waitForResponse(
    (r) => r.url().includes('/invoice') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await page.getByRole('button', { name: 'إصدار فاتورة' }).click()
const response = await created
check(`invoice drafted — ${response.status()}`, response.status() === 201)

await page.waitForURL(/\/manager\/invoices\/\d+/, { timeout: 20000 })
// Wait for the lines themselves, not just for spinners to clear — the loader
// can be absent for a frame between navigation and mount.
await page.waitForSelector('text=البنود', { timeout: 20000 })
await settled(page)

const draft = await page.locator('body').innerText()
check('lands on the draft invoice', draft.includes('مسودة'))
check('carries a labour line', draft.includes('أجر زيارة'))
check('shows the 14% VAT line', draft.includes('14'))

/* ── Price the labour, which the draft leaves at zero ────── */

await page.getByRole('button', { name: 'تعديل البنود' }).click()
await page.waitForTimeout(1000)

// The labour line is last; give it a price so the invoice is worth issuing.
const prices = page.locator('input[aria-label="سعر الوحدة"]')
await prices.last().fill('1500')

const savedDraft = page.waitForResponse(
    (r) => r.url().includes('/api/invoices/') && r.request().method() === 'PUT',
    { timeout: 20000 },
)
await page.getByRole('button', { name: 'حفظ' }).last().click()
check(`draft priced — ${(await savedDraft).status()}`, (await savedDraft).status() === 200)

await page.waitForTimeout(2000)
await settled(page)
check('total picks up the labour price', (await page.locator('body').innerText()).includes('1,500'))

/* ── Issue it ────────────────────────────────────────────── */

await page.getByRole('button', { name: 'إصدار الفاتورة' }).click()
await page.waitForTimeout(2500)
await settled(page)

const issued = await page.locator('body').innerText()
check('invoice becomes unpaid once issued', issued.includes('غير مدفوعة'))

/* ── Collect part of it ──────────────────────────────────── */

const total = await page.evaluate(() => {
    const token = localStorage.getItem('ce.token')

    return fetch(`/api/invoices/${location.pathname.split('/').pop()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
        .then((r) => r.json())
        .then((b) => b.data.total)
})

await page.getByRole('button', { name: 'تسجيل تحصيل' }).click()
await page.waitForTimeout(1200)

// Pay half, so the invoice lands in the partly-paid state.
const half = (Number(total) / 2).toFixed(2)
await page.locator('input[type=number]').first().fill(half)

const paid = page.waitForResponse(
    (r) => r.url().includes('/api/payments') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await page.getByRole('button', { name: 'تسجيل' }).last().click()
const payResponse = await paid
check(`payment recorded — ${payResponse.status()}`, payResponse.status() === 201)

await page.waitForTimeout(2500)
await settled(page)

const afterPay = await page.locator('body').innerText()
check('invoice shows as partly paid', afterPay.includes('مدفوعة جزئيًا'))
check('receipt is listed', afterPay.includes('سندات القبض') && afterPay.includes('RC-'))

/* ── Treasury reflects the money ─────────────────────────── */

await page.goto(`${BASE}/manager/treasury`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=حركة الخزينة', { timeout: 20000 })
await settled(page)

// The box list is its own request, so it can still be in flight when the
// movement feed has already painted. Waited for rather than read on arrival.
const boxListed = await page
    .waitForFunction(() => document.body.innerText.includes('الخزينة الرئيسية'), null, {
        timeout: 25000,
    })
    .then(() => true)
    .catch(() => false)
check('treasury lists the main box', boxListed)

// The ledger row for the receipt, waited for rather than read on arrival.
const ledgerRow = await page
    .waitForSelector('.badge:text-is("تحصيل من العملاء")', { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('treasury shows the collection', ledgerRow)

/* ── A technician sees none of it ────────────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/invoices`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is kept out of invoices', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\nbilling works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
