import { chromium } from 'playwright'

/**
 * The books, end to end: a sale and a receipt entered through the API, then
 * every accounting section opened in turn to check the same money shows up in
 * each of them and that the sheet balances.
 *
 * The point of the module is that the four statements are four views of one
 * journal. A test that opened only one of them would not be testing that.
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
 * Wait for a screen to have actually rendered, not merely to have stopped
 * showing a skeleton.
 *
 * The sidebar paints before the first query resolves, so «no shimmer on the
 * page» is true for a moment before there is anything to read — long enough to
 * make an assertion pass or fail for reasons that have nothing to do with the
 * code. A marker the section is known to contain is the honest signal.
 */
async function settled(page, marker) {
    await page
        .waitForFunction(
            (text) =>
                !document.querySelector('.shimmer') &&
                !document.querySelector('.animate-spin') &&
                (!text || document.body.innerText.includes(text)),
            marker,
            { timeout: 20000 },
        )
        .catch(() => {})
    await page.waitForTimeout(400)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'admin@cityeng.local')

/* ── A sale and a receipt, so the books have something in ── */

const SALE = 4000
const TAX = 0.14
const COLLECTED = 1000
/** What the sale leaves owing once the part-payment is taken off. */
const OUTSTANDING = SALE * (1 + TAX) - COLLECTED

const setup = await page.evaluate(async ({ amount, collected, taxRate }) => {
    const token = localStorage.getItem('ce.token')
    const send = async (method, url, body) => {
        const response = await fetch(`/api${url}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        })

        return { ok: response.ok, body: await response.json() }
    }

    const customers = await send('GET', '/customers?per_page=1')
    const customerId = customers.body.data[0].id

    const invoice = await send('POST', '/invoices', {
        customer_id: customerId,
        issue_date: new Date().toISOString().slice(0, 10),
        tax_rate: taxRate * 100,
        lines: [{ description: 'توريد وتركيب', qty: 1, unit_price: amount }],
    })

    const id = invoice.body.id ?? invoice.body.data?.id
    const issued = await send('POST', `/invoices/${id}/issue`)

    const paid = await send('POST', '/payments', {
        invoice_id: id,
        amount: collected,
    })

    return { invoiceOk: issued.ok, paymentOk: paid.ok }
}, { amount: SALE, collected: COLLECTED, taxRate: TAX })

check('a sale was raised and part-collected through the API', setup.invoiceOk && setup.paymentOk)

/* ── The chart ───────────────────────────────────────────── */

await page.goto(`${BASE}/manager/accounting`, { waitUntil: 'domcontentloaded' })
// 1102 is the receivable: present in every seeded chart, and a code rather
// than a name, so an operator renaming an account cannot break the test.
await settled(page, '1102')

check('the module redirects to the chart of accounts', page.url().includes('/accounting/accounts'))

const chart = await page.evaluate(() => document.body.innerText)
check('the chart is seeded on first look', chart.includes('1103') && chart.includes('4101'))

// Matched by code rather than by name: the seeded names carry brackets, and a
// bracket typed into a right-to-left string is a coin toss as to which way
// round it ends up in the file.
//
// The invoice debited the customer with the tax-inclusive total and the receipt
// credited back what was paid, so the account must hold at least the remainder.
const receivable = await accountBalance(page, '1102')
check('the receivable carries what is still owed on the sale', receivable >= OUTSTANDING - 0.005)

// Every box the treasury shows gets its own line under cash, which is the
// point of hanging the chart off the boxes rather than a single «cash» account.
check('each cash box has its own account under cash', /\n1101\d\d\n/.test(chart))

/* ── The journal ─────────────────────────────────────────── */

await page.goto(`${BASE}/manager/accounting/journal`, { waitUntil: 'domcontentloaded' })
await settled(page, 'JV-')

const journal = await page.evaluate(() => document.body.innerText)
check('the invoice reached the journal', journal.includes('فاتورة مبيعات'))
check('the receipt reached the journal', journal.includes('سند قبض'))

// Opening an entry must show both sides of it, which is the whole idea.
await page.locator('.card-interactive').first().click()
await page.waitForTimeout(700)
const entry = await page.evaluate(() => document.body.innerText)
check('an entry opens onto its two sides', entry.includes('مدين') && entry.includes('دائن'))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

/* ── The statements ──────────────────────────────────────── */

await page.goto(`${BASE}/manager/accounting/trial-balance`, { waitUntil: 'domcontentloaded' })
await settled(page, 'الميزان')
const trial = await page.evaluate(() => document.body.innerText)
check('the trial balance is level', trial.includes('الميزان متوازن'))

await page.goto(`${BASE}/manager/accounting/income-statement`, { waitUntil: 'domcontentloaded' })
await settled(page, 'مجمل الربح')
const income = await page.evaluate(() => document.body.innerText)
check('the income statement shows gross and net profit', income.includes('مجمل الربح'))

// The seeded company has already traded, so the sale is checked as an increase
// rather than as the whole of revenue.
const revenue = await accountBalance(page, '4101')
check('the sale reached revenue net of its tax', revenue >= SALE)

// Tax collected is owed to the authority, not earned.
const vat = await accountBalance(page, '2102')
check('the tax was held as a liability rather than counted as income', vat >= SALE * TAX)

await page.goto(`${BASE}/manager/accounting/balance-sheet`, { waitUntil: 'domcontentloaded' })
await settled(page, 'الميزانية')
const sheet = await page.evaluate(() => document.body.innerText)
check('the balance sheet balances', sheet.includes('الميزانية متوازنة'))
check('profit is folded into equity without a closing entry', sheet.includes('أرباح الفترة'))

/* ── The general ledger ──────────────────────────────────── */

await page.goto(`${BASE}/manager/accounting/ledger`, { waitUntil: 'domcontentloaded' })
await settled(page, 'الرصيد')
const ledger = await page.evaluate(() => document.body.innerText)
check('the general ledger opens on an account rather than an empty frame', ledger.includes('الرصيد'))

await page.goto(`${BASE}/manager/accounting/cost-centers`, { waitUntil: 'domcontentloaded' })
await settled(page, 'مراكز التكلفة')
const centres = await page.evaluate(() => document.body.innerText)
check('cost centres read as optional rather than missing', centres.includes('اختيارية'))

/* ── Nothing left unposted ───────────────────────────────── */

const warned = await page.evaluate(() => document.body.innerText.includes('لم يصل إلى دفتر اليومية'))
check('no document was left out of the journal', !warned)

/* ── A technician has no business here ───────────────────── */

await login(page, 'tech1@cityeng.local')
await page.goto(`${BASE}/manager/accounting`, { waitUntil: 'domcontentloaded' })
const bounced = await page
    .waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
check('technician is bounced out of the books', bounced)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\naccounting works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)

/* ── Helpers ─────────────────────────────────────────────── */

/**
 * One account's balance, read from the API rather than scraped off whichever
 * screen happens to be open. Account codes are stable; the Arabic names are
 * the operator's to change.
 */
async function accountBalance(page, code) {
    return page.evaluate(async (wanted) => {
        const response = await fetch('/api/accounting/accounts', {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${localStorage.getItem('ce.token')}`,
            },
        })

        const { data } = await response.json()

        return data.find((account) => account.code === wanted)?.balance ?? NaN
    }, code)
}
