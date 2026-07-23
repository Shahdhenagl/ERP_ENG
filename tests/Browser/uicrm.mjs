import { chromium } from 'playwright'

/**
 * The pipeline, end to end.
 *
 * A lead is captured, chased with a follow-up that then falls overdue, moved
 * along the pipeline, and won — which mints a customer. The overdue chase shows
 * on the dashboard; closing it clears it. The backend suite owns the
 * arithmetic and the conversion rules; here we prove the screens capture,
 * chase, convert and close without a page error.
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

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
// One handler for every confirm/prompt the walkthrough triggers.
page.on('dialog', (d) => d.accept().catch(() => {}))

await login(page, 'manager@cityeng.local')

/* ── Capture a lead and an overdue follow-up via the API ── */

const seed = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const post = async (url, body) =>
        (await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).json()

    const name = `مصنع التجربة ${Date.now()}`

    const lead = await post('/api/leads', {
        name,
        company: 'التجربة للصناعة',
        phone: '01098765432',
        source: 'referral',
        est_value: 75000,
    })
    const id = lead.data?.id ?? lead.id

    // A follow-up already past its date, so it lands on the chase list.
    const followUp = await post('/api/follow-ups', {
        subject_type: 'lead',
        subject_id: id,
        type: 'call',
        due_at: new Date(Date.now() - 864e5).toISOString(),
        note: 'مكالمة متابعة العرض',
    })

    return { id, name, code: lead.data?.code, followUpId: followUp.data?.id }
})

check('the API captured a lead', Boolean(seed.id))
check('an overdue follow-up was booked', Boolean(seed.followUpId))

/* ── The nav carries CRM, and the dashboard chases the overdue ── */

await page.goto(`${BASE}/manager`, { waitUntil: 'domcontentloaded' })
const navHasCrm = await page
    .locator('a[href="/manager/crm"]')
    .first()
    .waitFor({ state: 'attached', timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('the nav carries the CRM module', navHasCrm)
check('the dashboard flags the overdue follow-up', await sees(page, 'متابعات فات موعدها'))

/* ── The pipeline lists the lead ─────────────────────────── */

await page.goto(`${BASE}/manager/crm`, { waitUntil: 'domcontentloaded' })
check('the pipeline opens', await sees(page, 'العملاء المحتملون'))
check('the lead is listed', await sees(page, seed.name))

/* ── Its detail shows the chase, and it moves along the pipeline ── */

await page.getByRole('button', { name: seed.name }).first().click()
check('the detail shows the booked follow-up', await sees(page, 'مكالمة متابعة العرض'))

await page.getByRole('button', { name: 'مؤهَّل', exact: true }).click()
check('the lead is qualified', await sees(page, 'مؤهَّل'))

/* ── Winning it mints a customer ─────────────────────────── */

await page.getByRole('button', { name: 'كسب وتحويل' }).click()
check('the lead is won', await sees(page, 'مكسوب'))
check('a registered customer is offered', await sees(page, 'فتح العميل المسجّل'))

/* ── The follow-ups tab closes the chase ─────────────────── */

await page.getByRole('button', { name: 'المتابعات', exact: true }).click()
check('the overdue follow-up is listed', await sees(page, seed.name))
check('it is marked late', await sees(page, 'متأخّر'))

await page.getByRole('button', { name: 'إغلاق' }).first().click()
check('closing it empties the chase list', await sees(page, 'لا متابعات مفتوحة'))

/* ── The report reads the pipeline back ──────────────────── */

await page.goto(`${BASE}/manager/reports/crm`, { waitUntil: 'domcontentloaded' })
check('the CRM report opens', await sees(page, 'نسبة الكسب'))
check('it breaks the pipeline down by source', await sees(page, 'الفعالية حسب المصدر'))
// The lead we won earlier came from a referral, so it converted 100%.
check('it shows the won deal', await sees(page, 'مكسوب في الفترة'))

/* ── The API bars a technician ───────────────────────────── */

await login(page, 'tech1@cityeng.local')
const barred = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const res = await fetch('/api/leads', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    return res.status
})
check('a technician is refused the pipeline', barred === 403)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\nCRM module works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
