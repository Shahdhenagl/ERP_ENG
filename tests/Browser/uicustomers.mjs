import { chromium } from 'playwright'

/**
 * The customer file: type, unique phone, filters, and the profile.
 *
 * A customer is captured with an institution type; a second one cannot steal
 * its phone; the list filters by type and by where each account stands on its
 * cover; and one customer's whole file — contracts, quotations, devices —
 * opens on its own page. The backend suite owns the rules; here the screens.
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

async function sees(page, text, timeout = 25000) {
    return page
        .waitForFunction((t) => document.body.innerText.includes(t), text, { timeout })
        .then(() => true)
        .catch(() => false)
}

// The list keeps the previous rows on screen while a filtered fetch is in
// flight, so proving a filter hides something means waiting for it to leave.
async function gone(page, text, timeout = 10000) {
    return page
        .waitForFunction((t) => !document.body.innerText.includes(t), text, { timeout })
        .then(() => true)
        .catch(() => false)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'manager@cityeng.local')

/* ── Seed a hospital with cover about to lapse ───────────── */

const stamp = Date.now()
const phone = `0100${String(stamp).slice(-7)}`
const name = `مستشفى التجربة ${stamp}`

const seed = await page.evaluate(
    async ({ name, phone }) => {
        const token = localStorage.getItem('ce.token')
        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        }
        const post = async (url, body) =>
            (await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).json()

        const customer = await post('/api/customers', { name, phone, type: 'hospital' })
        const id = customer.data?.id ?? customer.id

        const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
        const past = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)

        const contract = await post('/api/contracts', {
            customer_id: id,
            title: 'عقد صيانة سنوي',
            starts_on: past,
            ends_on: soon,
            visits_per_year: 4,
            status: 'active',
            value: 80000,
        })

        // A second customer trying to reuse the phone — should be refused.
        const dupe = await fetch('/api/customers', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: 'سارق الرقم', phone }),
        })

        return {
            id,
            // The store response is the resource unwrapped — code sits at top level.
            code: customer.code ?? customer.data?.code,
            contractCode: contract.data?.code ?? contract.code,
            dupeStatus: dupe.status,
        }
    },
    { name, phone },
)

check('a typed customer was captured', Boolean(seed.id))
check('a contract about to expire was attached', Boolean(seed.contractCode))
check('a second customer cannot reuse the phone', seed.dupeStatus === 422)

/* ── The list shows the type and the contract standing ───── */

await page.goto(`${BASE}/manager/customers`, { waitUntil: 'domcontentloaded' })
check('the customer is listed', await sees(page, name))
check('its institution type shows', await sees(page, 'مستشفى'))
check('its cover reads as about to lapse', await sees(page, 'قارب على الانتهاء'))

/* ── Filters narrow the list ─────────────────────────────── */

await page.getByLabel('نوع المؤسسة').selectOption('bank')
check('filtering to banks hides the hospital', await gone(page, name))

await page.getByLabel('نوع المؤسسة').selectOption('hospital')
check('filtering to hospitals brings it back', await sees(page, name))

await page.getByLabel('حالة العقد').selectOption('expiring')
check('the expiring filter keeps it', await sees(page, name))

await page.getByLabel('حالة العقد').selectOption('active')
check('the plain-active filter drops it (it is expiring)', await gone(page, name))

/* ── The profile opens on the whole file ─────────────────── */

await page.getByLabel('حالة العقد').selectOption('')
await page.getByRole('link', { name }).first().click()
check('the profile opens on the customer', await sees(page, seed.code))
check('the profile lists the contract', await sees(page, seed.contractCode))
check('the profile counts a live contract', await sees(page, 'عقود سارية'))

/* ── The form offers the institution types ───────────────── */

await page.goto(`${BASE}/manager/customers`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'عميل جديد' }).click()
const dialog = page.getByRole('dialog', { name: 'عميل جديد' })
await dialog.waitFor({ state: 'visible' })
check('the form carries the type field', await sees(page, 'نوع المؤسسة'))
check(
    'the type field lists an institution kind',
    (await dialog.locator('option', { hasText: 'مركز بيانات' }).count()) > 0,
)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\ncustomer file works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
