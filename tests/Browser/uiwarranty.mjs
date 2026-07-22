import { chromium } from 'playwright'

/**
 * The warranty module end to end: register cover, print the certificate,
 * file a claim, dispatch the repair, close it, extend the term, and read the
 * whole story back off the device page.
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

/**
 * Wait for text to appear rather than for a fixed number of seconds.
 *
 * `artisan serve` runs one worker unless PHP_CLI_SERVER_WORKERS is set, so
 * every request on a page queues behind the last one. A timed wait passes on a
 * fast machine and fails on a slow one, which makes the suite a coin toss
 * rather than a test.
 */
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
    await page.waitForTimeout(500)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// Only an admin gets the sidebar, and the nesting is checked first.
await login(page, 'admin@cityeng.local')

/* ── The sidebar carries it ──────────────────────────────── */

await page.goto(`${BASE}/manager/assets`, { waitUntil: 'domcontentloaded' })
await settled(page)

const parent = page.locator('aside a[href="/manager/warranties"]').first()
const register = page.locator('aside a[href="/manager/warranties/register"]').first()
const claimsLink = page.locator('aside a[href="/manager/warranties/claims"]').first()

check('الضمانات is in the sidebar', await parent.isVisible())
check('سجل الضمانات is nested under it', await register.isVisible())
check('المطالبات is nested under it', await claimsLink.isVisible())

/* ── Register cover ──────────────────────────────────────── */

await register.click()
await page.waitForURL(/\/manager\/warranties\/register$/, { timeout: 20000 })
await settled(page)

// Two devices, chosen by their cover rather than by position: one to put
// under warranty, and one with none so the guard can be tested against it.
const assets = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const response = await fetch('/api/assets?per_page=50', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    const body = await response.json()

    return {
        target: body.data[0],
        uncovered: body.data.find((a) => a.under_warranty !== true),
    }
})

check('found a device to cover', Boolean(assets.target))
check('found a device with no cover', Boolean(assets.uncovered))

await page.getByRole('button', { name: 'تسجيل ضمان' }).click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(1200)

const dialog = page.locator('[role=dialog]')
await dialog.locator('select').first().selectOption(String(assets.target.id))
await dialog.locator('input[type=number]').first().fill('12')
await dialog
    .locator('textarea')
    .first()
    .fill('لا يشمل الضمان سوء الاستخدام أو التلف الناتج عن ارتفاع الجهد.')

const registered = page.waitForResponse(
    (r) => r.url().endsWith('/api/warranties') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await dialog.getByRole('button', { name: 'حفظ' }).click()
const registerResponse = await registered
check(`warranty registered — ${registerResponse.status()}`, registerResponse.status() === 201)

const warrantyCode = (await registerResponse.json()).data.code
const warrantyId = (await registerResponse.json()).data.id

check('the register lists it', await sees(page, warrantyCode))
check('it reads as covered', await sees(page, 'ساري'))
check(
    'the remaining days are stated',
    await page
        .waitForFunction(() => /باقٍ\s+\d+\s+يوم/.test(document.body.innerText), null, {
            timeout: 25000,
        })
        .then(() => true)
        .catch(() => false),
)

/* ── The certificate ─────────────────────────────────────── */

const certificate = await context.newPage()
await certificate.goto(`${BASE}/manager/print/warranty/${warrantyId}`, {
    waitUntil: 'domcontentloaded',
})
await certificate.waitForSelector('text=شهادة ضمان', { timeout: 20000 })
await certificate.waitForTimeout(1500)

const paper = await certificate.locator('body').innerText()
check('the certificate names the warranty', paper.includes(warrantyCode))
check('the certificate states the term', paper.includes('مدة الضمان'))
check('the certificate states what is covered', paper.includes('قطع غيار ومصنعية'))
check('the certificate prints the conditions', paper.includes('سوء الاستخدام'))
check('the certificate is signed for', paper.includes('استلم العميل'))
await certificate.close()

/* ── A claim, judged and dispatched ──────────────────────── */

await claimsLink.click()
await page.waitForURL(/\/manager\/warranties\/claims$/, { timeout: 20000 })
await settled(page)

await page.getByRole('button', { name: 'بلاغ جديد' }).click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(1200)

await page.locator('[role=dialog] select').first().selectOption(String(assets.target.id))
await page.locator('[role=dialog] textarea').first().fill('الجهاز لا يشحن البطاريات')

const filed = page.waitForResponse(
    (r) => r.url().endsWith('/api/warranty-claims') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await page.locator('[role=dialog]').getByRole('button', { name: 'فتح البلاغ' }).click()
check(`claim filed — ${(await filed).status()}`, (await filed).status() === 201)

check('the claim is listed as open', await sees(page, 'تحت الفحص'))

// A device with no cover cannot be claimed against — the guard, not a screen.
const refused = await page.evaluate(async (assetId) => {
    const token = localStorage.getItem('ce.token')
    const response = await fetch('/api/warranty-claims', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ asset_id: assetId, fault: 'عطل' }),
    })

    return response.status
}, assets.uncovered.id)
check(`a claim without cover is refused — ${refused}`, refused === 422)

/* ── Approve, dispatch, close ────────────────────────────── */

await page.getByRole('button', { name: 'اعتماد' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(800)

const approved = page.waitForResponse((r) => r.url().includes('/decide'), { timeout: 20000 })
await page.locator('[role=dialog]').getByRole('button', { name: 'اعتماد' }).click()
check(`claim approved — ${(await approved).status()}`, (await approved).status() === 200)

check('the claim reads as approved', await sees(page, 'معتمدة'))

await page.getByRole('button', { name: 'أمر إصلاح' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(1000)

const dispatched = page.waitForResponse((r) => r.url().includes('/repair-order'), { timeout: 20000 })
await page.locator('[role=dialog]').getByRole('button', { name: 'فتح أمر الإصلاح' }).click()
const repairResponse = await dispatched
check(`repair order raised — ${repairResponse.status()}`, repairResponse.status() === 201)

const workOrder = (await repairResponse.json()).data.code
check('the repair order is an ordinary work order', workOrder.startsWith('WO-'))

check('the claim links to its repair order', await sees(page, workOrder))

await page.getByRole('button', { name: 'تم الإصلاح' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(800)

const closed = page.waitForResponse((r) => r.url().includes('/decide'), { timeout: 20000 })
await page.locator('[role=dialog]').getByRole('button', { name: 'إقفال' }).click()
check(`claim closed — ${(await closed).status()}`, (await closed).status() === 200)

/* ── Extending the term ──────────────────────────────────── */

await register.click()
await page.waitForURL(/\/manager\/warranties\/register$/, { timeout: 20000 })
await settled(page)

await page.getByRole('button', { name: 'تمديد' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(800)

const extended = page.waitForResponse((r) => r.url().includes('/extend'), { timeout: 20000 })
await page.locator('[role=dialog]').getByRole('button', { name: 'تمديد' }).click()
const extendResponse = await extended
check(`term extended — ${extendResponse.status()}`, extendResponse.status() === 201)

check('the extension follows the original', await sees(page, `تمديد ${warrantyCode}`))

/* ── The device's own history ────────────────────────────── */

await page.goto(`${BASE}/manager/assets/${assets.target.id}`, { waitUntil: 'domcontentloaded' })
check('the device shows its cover', await sees(page, warrantyCode))
check('the device shows the claim', await sees(page, 'مطالبات الضمان'))
check('the device shows the fault', await sees(page, 'لا يشحن البطاريات'))
check('the device shows the repair was done', await sees(page, 'تم الإصلاح'))

/* ── A technician has no business here ───────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/warranties/register`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is bounced out of the warranty register', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\nwarranties work ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
