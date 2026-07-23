import { chromium } from 'playwright'

/**
 * The people module, end to end.
 *
 * An employee is hired, asks for leave, takes a salary advance, and a month's
 * payroll is opened, approved and paid — the same arc HR actually walks. The
 * numbers are checked once (the backend suite owns the arithmetic); here we
 * prove the screens hire, approve, pay, and print without a page error.
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
// One handler for every confirm/prompt the walkthrough triggers — accepting
// each with its default. A per-action handler left armed would catch the next
// dialog and double-accept it.
page.on('dialog', (d) => d.accept().catch(() => {}))

await login(page, 'manager@cityeng.local')

/* ── Seed a person, a leave request and an advance via the API ── */

const seed = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const post = async (url, body) =>
        (await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).json()

    const stamp = Date.now()
    const name = `عامر التجريبي ${stamp}`

    const employee = await post('/api/employees', {
        name,
        job_title: 'فني أول',
        basic_salary: 6000,
        allowances: [{ name: 'بدل انتقال', amount: 1000 }],
        insurance_rate: 14,
        tax_rate: 10,
        annual_leave_days: 21,
        status: 'active',
    })

    const id = employee.data?.id ?? employee.id

    const leave = await post('/api/leave', {
        employee_id: id,
        type: 'annual',
        from_date: '2026-08-02',
        to_date: '2026-08-06',
        reason: 'ظرف عائلي',
    })

    const advance = await post('/api/advances', {
        employee_id: id,
        amount: 2000,
        installment: 500,
    })

    return {
        id,
        name,
        employeeCode: employee.data?.code ?? null,
        leaveCode: leave.data?.code ?? null,
        advanceCode: advance.data?.code ?? null,
    }
})

check('the API hired an employee', Boolean(seed.id))
check('a leave request was filed', Boolean(seed.leaveCode))
check('an advance was disbursed', Boolean(seed.advanceCode))

/* ── The nav carries the module, and it opens on the roster ── */

await page.goto(`${BASE}/manager`, { waitUntil: 'domcontentloaded' })
// Wait for the link rather than a fixed beat: under a full parallel sweep the
// async user/nav can take longer than any timeout worth hard-coding.
const navHasHr = await page
    .locator('a[href="/manager/hr"]')
    .first()
    .waitFor({ state: 'attached', timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('the nav carries the HR module', navHasHr)

await page.goto(`${BASE}/manager/hr`, { waitUntil: 'domcontentloaded' })
check('the page opens on the roster', await sees(page, 'الموارد البشرية'))
check('the roster shows the new hire', await sees(page, seed.name))

/* ── Leave: the request shows, and it can be approved ─────── */

await page.getByRole('button', { name: 'الإجازات' }).click()
check('the leave request is listed', await sees(page, seed.leaveCode))

// `exact` matters: the "بانتظار الاعتماد" filter toggle contains the word too.
await page.getByRole('button', { name: 'اعتماد', exact: true }).first().click()
check('the leave is approved', await sees(page, 'معتمدة'))

/* ── Advances: the disbursement and its outstanding balance ── */

await page.getByRole('button', { name: 'السلف' }).click()
check('the advance is listed', await sees(page, seed.advanceCode))
check('its outstanding balance is shown', await sees(page, 'متبقٍ'))

/* ── Payroll: open August, approve it, pay it, print a slip ── */

const run = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const res = await (
        await fetch('/api/payroll', {
            method: 'POST',
            headers,
            body: JSON.stringify({ year: 2026, month: 8 }),
        })
    ).json()
    return { id: res.data?.id, code: res.data?.code, slips: res.data?.payslips?.length ?? 0 }
})

check('a payroll month was opened', Boolean(run.id) && run.slips > 0)

await page.goto(`${BASE}/manager/hr`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'الرواتب' }).click()
check('the run is listed', await sees(page, 'أغسطس'))

await page.getByRole('button', { name: /أغسطس/ }).first().click()
check('the run detail opens on its slips', await sees(page, seed.name))

await page.getByRole('button', { name: 'اعتماد', exact: true }).first().click()
check('the run is approved', await sees(page, 'صرف الكل'))

await page.getByRole('button', { name: 'صرف الكل' }).click()
const payDialog = page.getByRole('dialog', { name: 'صرف رواتب المسير' })
await payDialog.waitFor({ state: 'visible' })
await payDialog.getByRole('button', { name: 'صرف', exact: true }).click()
check('the run is paid', await sees(page, 'مدفوع'))

/* ── The printable payslip renders with a net figure ─────── */

const slipId = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    const runs = await (await fetch('/api/payroll?per_page=1', { headers })).json()
    const detail = await (
        await fetch(`/api/payroll/${runs.data[0].id}`, { headers })
    ).json()
    return detail.data.payslips[0].id
})

await page.goto(`${BASE}/manager/print/payslips/${slipId}`, { waitUntil: 'domcontentloaded' })
check('the payslip prints', await sees(page, 'قسيمة راتب'))
check('it carries the net due', await sees(page, 'صافي المستحق'))
check('it shows the withheld insurance', await sees(page, 'تأمينات اجتماعية'))

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\nHR module works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
