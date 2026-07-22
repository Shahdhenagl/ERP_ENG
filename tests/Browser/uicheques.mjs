import { chromium } from 'playwright'

/**
 * Cheques and bank reconciliation.
 *
 * The check the module exists for is the dull-looking one: recording a cheque
 * must leave the treasury and the invoice exactly where they were. A system
 * that counts uncleared cheques as collected plans against money it does not
 * have, and finds out when one bounces.
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

async function settled(page) {
    await page
        .waitForFunction(
            () => !document.querySelector('.shimmer') && !document.querySelector('.animate-spin'),
            { timeout: 20000 },
        )
        .catch(() => {})
    await page.waitForTimeout(400)
}

/** The invoice and the bank account, as the API reports them now. */
async function state(page, invoiceId, boxId) {
    return page.evaluate(
        async ([invoice, box]) => {
            const token = localStorage.getItem('ce.token')
            const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
            const get = async (url) => (await fetch(url, { headers })).json()

            const [inv, boxes] = await Promise.all([
                get(`/api/invoices/${invoice}`),
                get('/api/treasury/boxes'),
            ])

            return {
                balance: Number(inv.data.balance),
                state: inv.data.payment_state,
                bank: Number(boxes.data.find((b) => b.id === box).balance),
            }
        },
        [invoiceId, boxId],
    )
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'manager@cityeng.local')

/* ── An issued invoice and a bank account ────────────────── */

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

    const customers = await get('/api/customers?per_page=1')

    const invoice = await post('/api/invoices', {
        customer_id: customers.data[0].id,
        lines: [{ description: 'توريد وتركيب', qty: 1, unit_price: 9000 }],
    })

    const invoiceId = invoice.data?.id ?? invoice.id
    await post(`/api/invoices/${invoiceId}/issue`, {})

    const bank = await post('/api/treasury/boxes', {
        name: 'حساب الشيكات',
        type: 'bank',
        account_number: '77001',
    })

    return {
        invoiceId,
        invoiceCode: invoice.data?.code ?? invoice.code,
        customerId: customers.data[0].id,
        bankId: bank.data.id,
    }
})

check(`issued ${setup.invoiceCode} for 9,000`, Boolean(setup.invoiceId))

const before = await state(page, setup.invoiceId, setup.bankId)
check(`the invoice is owed in full — ${before.balance}`, before.balance === 9000)
check(`the bank account is empty — ${before.bank}`, before.bank === 0)

/* ── Record the cheque ───────────────────────────────────── */

await page.goto(`${BASE}/manager/cheques`, { waitUntil: 'domcontentloaded' })
await settled(page)

check('the page states what a cheque is', await sees(page, 'وعد بالمال، وليس مالًا'))

await page.getByRole('button', { name: 'شيك وارد' }).click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(1000)

const dialog = page.locator('[role=dialog]')
await dialog.locator('select').first().selectOption(String(setup.customerId))
await page.waitForTimeout(1200)

// Naming the invoice is what lets clearing settle it rather than landing the
// money on the account. The picker appears once a customer is chosen.
await dialog.locator('select').nth(1).selectOption(String(setup.invoiceId))
check('choosing the invoice fills in what it still owes', await sees(page, '9,000'))

await dialog.locator('input[dir=ltr]').first().fill('CHQ-55501')

// Bank name, then the drawer's name.
const texts = dialog.locator('input:not([type=date]):not([type=number]):not([dir=ltr])')
await texts.nth(0).fill('بنك مصر')

const dates = dialog.locator('input[type=date]')
await dates.nth(1).fill(new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10))
await dialog.locator('input[type=number]').first().fill('9000')

const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/cheques') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await dialog.getByRole('button', { name: 'حفظ' }).click()
check(`cheque recorded — ${(await created).status()}`, (await created).status() === 201)

await settled(page)
check('the cheque is listed', await sees(page, 'CHQ-55501'))

/* ── Nothing moved ───────────────────────────────────────── */

const held = await state(page, setup.invoiceId, setup.bankId)
check(
    `holding it left the invoice owed — ${held.balance}`,
    held.balance === 9000 && held.state === 'unpaid',
)
check(`and the bank empty — ${held.bank}`, held.bank === 0)

/* ── Deposit — still not money ───────────────────────────── */

await page.getByRole('button', { name: 'إيداع بالبنك' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(800)

await page.locator('[role=dialog] select').first().selectOption(String(setup.bankId))

const deposited = page.waitForResponse((r) => r.url().includes('/transition'), { timeout: 20000 })
await page.locator('[role=dialog]').getByRole('button', { name: 'إيداع' }).click()
check(`deposited — ${(await deposited).status()}`, (await deposited).status() === 200)

await settled(page)

const banked = await state(page, setup.invoiceId, setup.bankId)
check(
    `with the bank is not cleared by the bank — ${banked.bank}`,
    banked.bank === 0 && banked.balance === 9000,
)

/* ── Clearing is what moves it ───────────────────────────── */

const cleared = page.waitForResponse((r) => r.url().includes('/transition'), { timeout: 20000 })
await page.getByRole('button', { name: 'تم التحصيل' }).first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(800)
await page.locator('[role=dialog]').getByRole('button', { name: 'تحصيل' }).click()
check(`cleared — ${(await cleared).status()}`, (await cleared).status() === 200)

await settled(page)

const settledState = await state(page, setup.invoiceId, setup.bankId)
check(`the bank now holds the money — ${settledState.bank}`, settledState.bank === 9000)
check(
    `and the invoice is settled — ${settledState.balance}`,
    settledState.balance === 0 && settledState.state === 'paid',
)

/* ── A bounced cheque needs no reversal ──────────────────── */

const bounce = await page.evaluate(async ([customerId, bankId]) => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }

    const made = await (
        await fetch('/api/cheques', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                direction: 'incoming',
                customer_id: customerId,
                cheque_number: 'CHQ-BOUNCE',
                due_date: new Date().toISOString().slice(0, 10),
                amount: 4000,
            }),
        })
    ).json()

    const id = made.data.id

    await fetch(`/api/cheques/${id}/transition`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'bounce', reason: 'رصيد غير كافٍ' }),
    })

    const boxes = await (await fetch('/api/treasury/boxes', { headers })).json()

    return { bank: Number(boxes.data.find((b) => b.id === bankId).balance) }
}, [setup.customerId, setup.bankId])

check(`a bounce leaves the bank untouched — ${bounce.bank}`, bounce.bank === 9000)

/* ── Reconciliation ──────────────────────────────────────── */

const reconciliation = await page.evaluate(async (bankId) => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }

    const before = await (
        await fetch(`/api/treasury/boxes/${bankId}/reconciliation`, { headers })
    ).json()

    await fetch('/api/treasury/reconcile', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: before.rows.map((r) => r.id), reconciled: true }),
    })

    const after = await (
        await fetch(`/api/treasury/boxes/${bankId}/reconciliation?statement_balance=9000`, {
            headers,
        })
    ).json()

    return {
        unreconciledBefore: Number(before.unreconciled_total),
        unreconciledAfter: Number(after.unreconciled_total),
        difference: Number(after.difference),
    }
}, setup.bankId)

check(
    `the bank had not shown it yet — ${reconciliation.unreconciledBefore}`,
    reconciliation.unreconciledBefore === 9000,
)
check(
    `ticking it off closes the gap — ${reconciliation.unreconciledAfter}`,
    reconciliation.unreconciledAfter === 0,
)
check(`and agrees with the statement — ${reconciliation.difference}`, reconciliation.difference === 0)

/* ── A technician has no business here ───────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/cheques`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is bounced out of the cheque book', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\ncheques work ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
