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

/* ── Manager: the store ──────────────────────────────────── */
{
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-EG' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))

    await login(page, 'manager@cityeng.local')
    await page.goto(`${BASE}/manager/inventory`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=قيمة المخزون', { timeout: 20000 })
    await settled(page)

    const body = await page.locator('body').innerText()
    check('inventory page lists the seeded items', body.includes('بطارية 12V 100Ah'))

    // 20 @ 950, 10 @ 1010, then 10 @ 980 off the purchase order:
    // (19000 + 10100 + 9800) / 40 = 972.50 — none of the three invoice prices.
    check('weighted average is shown, not an invoice price', body.includes('972.50'))
    check('stock value is shown', body.includes('قيمة المخزون'))

    // The fuse sits below its reorder level of 20 (15 received).
    check('flags an item below its reorder level', body.includes('تحت حد الطلب'))

    // The sections are routes now rather than tabs, so navigate to them.
    await page.goto(`${BASE}/manager/inventory/warehouses`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    const warehouses = await page.locator('body').innerText()
    check('lists the main store', warehouses.includes('المخزن الرئيسي'))
    check('lists a technician custody', warehouses.includes('عهدة'))

    await page.goto(`${BASE}/manager/inventory/movements`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    const movements = await page.locator('body').innerText()
    check('ledger shows receipts', movements.includes('وارد'))
    check('ledger shows transfers', movements.includes('تحويل'))

    check('no page errors', errors.length === 0)
    if (errors.length) console.log(errors.slice(0, 3))

    await context.close()
}

/* ── Technician: custody, then consuming a part ──────────── */
{
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))

    // tech1 was handed 4 batteries and 2 fans by the seeder.
    await login(page, 'tech1@cityeng.local')
    await page.goto(`${BASE}/tech/stock`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=عهدتي', { timeout: 20000 })
    await settled(page)

    const van = await page.locator('body').innerText()
    check('technician sees their own custody', van.includes('بطارية 12V 100Ah'))

    check(
        'technician cannot reach the store',
        await page
            .goto(`${BASE}/manager/inventory`, { waitUntil: 'domcontentloaded' })
            .then(() =>
                page
                    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
                    .then(() => true)
                    .catch(() => false),
            ),
    )

    check('no page errors', errors.length === 0)
    if (errors.length) console.log(errors.slice(0, 3))

    await context.close()
}

/* ── Consuming a part deducts it from the van ────────────── */
{
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' })
    const page = await context.newPage()

    // tech2 is the technician the seeder hands stock to. Which job is theirs is
    // asked for rather than assumed — task ids shift as the seed data grows.
    await login(page, 'tech2@cityeng.local')

    const taskId = await page.evaluate(async () => {
        const token = localStorage.getItem('ce.token')
        const res = await fetch('/api/tasks?status=in_progress', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })

        return (await res.json()).data[0]?.id ?? null
    })

    check(`technician has an in-progress job — #${taskId}`, Boolean(taskId))

    const before = await page.evaluate(async () => {
        const token = localStorage.getItem('ce.token')
        const res = await fetch('/api/stock/mine', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
        const body = await res.json()

        return body.data[0]?.qty ?? 0
    })

    await page.goto(`${BASE}/tech/tasks/${taskId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=مسار المهمة', { timeout: 20000 })
    await settled(page)

    await page.getByRole('button', { name: 'إنهاء' }).first().click()
    await page.waitForTimeout(1200)

    // Add a part line and pick the battery off the van.
    await page.getByRole('button', { name: 'إضافة' }).first().click()
    await page.waitForTimeout(400)

    const picker = page.locator('select').last()
    const options = await picker.locator('option').allInnerTexts()
    check(`part picker offers van stock — ${options.length - 1} item(s)`, options.length > 1)

    await picker.selectOption({ index: 1 })
    await page.locator('input[type=number]').last().fill('1')

    const saved = page.waitForResponse(
        (r) => r.url().includes('/reports') && r.request().method() === 'POST',
        { timeout: 20000 },
    )
    await page.getByRole('button', { name: /حفظ/ }).first().click()
    const response = await saved
    check(`report saved — ${response.status()}`, response.status() === 201)

    await page.waitForTimeout(2000)

    const after = await page.evaluate(async () => {
        const token = localStorage.getItem('ce.token')
        const res = await fetch('/api/stock/mine', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
        const body = await res.json()

        return body.data[0]?.qty ?? 0
    })

    check(`van stock fell ${before} → ${after}`, after === before - 1)

    await context.close()
}

await browser.close()
console.log(failures === 0 ? '\ninventory works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
