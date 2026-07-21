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

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await login(page, 'manager@cityeng.local')

/* ── The seed models one account with two sites ──────────── */

const seeded = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const get = async (url) =>
        (await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()

    const branches = await get('/api/branches')
    const byCustomer = {}

    for (const branch of branches.data) {
        byCustomer[branch.customer] = (byCustomer[branch.customer] ?? 0) + 1
    }

    const multi = Object.entries(byCustomer).find(([, count]) => count > 1)

    return {
        total: branches.data.length,
        multiSiteCustomer: multi?.[0] ?? null,
        withDevices: branches.data.filter((b) => (b.assets_count ?? 0) > 0).length,
    }
})

check(`branches exist — ${seeded.total}`, seeded.total > 0)
check(`one account has several sites — ${seeded.multiSiteCustomer}`, Boolean(seeded.multiSiteCustomer))
check(`devices are filed against branches — ${seeded.withDevices}`, seeded.withDevices > 0)

/* ── Adding a branch through the UI ──────────────────────── */

await page.goto(`${BASE}/manager/customers`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=العملاء', { timeout: 20000 })
await settled(page)

// The strip is folded away by default; open the first customer's.
await page.getByRole('button', { name: 'الفروع' }).first().click()
await page.waitForSelector('text=إضافة فرع', { timeout: 20000 })
// The list arrives on its own request; reading before it lands sees nothing.
await page.waitForSelector('text=الفرع الرئيسي', { timeout: 20000 }).catch(() => {})
check('branch strip lists the existing site', (await page.locator('body').innerText()).includes('الفرع الرئيسي'))

await page.getByRole('button', { name: 'إضافة فرع' }).first().click()
await page.waitForSelector('text=فرع جديد', { timeout: 20000 })

// The project's Field component does not wire `for`/`id`, so reach the
// inputs through the dialog rather than by label.
const dialog = page.locator('[role=dialog]').last()
await dialog.locator('input').first().fill('فرع الإسكندرية')
await dialog.locator('textarea').first().fill('22 طريق الجيش، سموحة')

const created = page.waitForResponse(
    (r) => r.url().includes('/branches') && r.request().method() === 'POST',
    { timeout: 20000 },
)
await dialog.getByRole('button', { name: 'حفظ' }).click()
const createResponse = await created
check(`branch saved — ${createResponse.status()}`, createResponse.status() === 201)

await page.waitForTimeout(1500)
check('new branch appears in the strip', (await page.locator('body').innerText()).includes('فرع الإسكندرية'))

/* ── A job sent to a branch navigates to the branch ──────── */

const dispatched = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }
    const get = async (url) => (await fetch(url, { headers })).json()

    // Find a customer with more than one site and use its second.
    const branches = (await get('/api/branches')).data
    const grouped = {}

    for (const branch of branches) grouped[branch.customer_id] ??= []
    for (const branch of branches) grouped[branch.customer_id].push(branch)

    const [customerId, sites] = Object.entries(grouped).find(([, list]) => list.length > 1)
    const target = sites.find((s) => s.address) ?? sites[0]

    const task = await (
        await fetch('/api/tasks', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                customer_id: Number(customerId),
                branch_id: target.id,
                title: 'صيانة على فرع محدد',
                type: 'maintenance',
                priority: 'normal',
            }),
        })
    ).json()

    // And a branch belonging to somebody else must be refused.
    const foreign = branches.find((b) => b.customer_id !== Number(customerId))
    const rejected = await fetch('/api/tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            customer_id: Number(customerId),
            branch_id: foreign.id,
            title: 'مهمة بفرع عميل آخر',
            type: 'maintenance',
            priority: 'normal',
        }),
    })

    return {
        branchName: target.name,
        branchAddress: target.address,
        taskAddress: task.effective_address,
        taskBranchId: task.branch_id,
        foreignStatus: rejected.status,
    }
})

check(`job carries its branch — ${dispatched.branchName}`, Boolean(dispatched.taskBranchId))
check(
    'job inherits the branch address, not head office',
    dispatched.taskAddress === dispatched.branchAddress,
)
check(
    `another customer's branch refused — ${dispatched.foreignStatus}`,
    dispatched.foreignStatus === 422,
)

/* ── The technician sees who to meet on site ─────────────── */

const jobId = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const res = await fetch('/api/tasks?per_page=50', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    const body = await res.json()

    return body.data.find((t) => t.branch_id)?.id ?? null
})

await page.goto(`${BASE}/manager/tasks/${jobId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=بيانات العميل', { timeout: 20000 })
await settled(page)

const detail = await page.locator('body').innerText()
check('task detail names the branch', /فرع|الفرع الرئيسي/.test(detail))

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\nbranches work ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
