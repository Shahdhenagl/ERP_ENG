import { chromium } from 'playwright'

/**
 * Granular permissions.
 *
 * The case this exists for, in the user's own words: «موظف مخزن يشوف المخزون
 * بس» — a storekeeper who sees inventory and nothing else. Before this there
 * were three roles and no way to express it.
 *
 * The property worth guarding hardest is the boring one: nobody's access moves
 * on the day it ships. A permission layer that quietly locked someone out
 * would be worse than none.
 */

const BASE = 'http://127.0.0.1:8000'
const browser = await chromium.launch()

let failures = 0
const check = (label, pass) => {
    console.log(`${pass ? '✓' : '❌'} ${label}`)
    if (!pass) failures++
}

async function login(page, email, password = 'password') {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button[type=submit]')
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
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

/** Every destination the current page offers. */
async function links(page) {
    return page.evaluate(() =>
        [...document.querySelectorAll('a[href^="/manager"]')]
            .filter((a) => a.offsetParent !== null)
            .map((a) => a.getAttribute('href')),
    )
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-EG' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

/* ── Nobody's access moved ───────────────────────────────── */

await login(page, 'manager@cityeng.local')
await settled(page)

const managerCan = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const me = await (
        await fetch('/api/me', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
    ).json()

    return me.data.permissions ?? []
})

check(
    `a manager keeps what a manager always had — ${managerCan.length} permissions`,
    managerCan.includes('invoices.manage') &&
        managerCan.includes('inventory.manage') &&
        managerCan.includes('accounting.view'),
)
check(
    'and still none of the admin ones',
    !managerCan.includes('users.manage') && !managerCan.includes('accounting.manage'),
)

/* ── Build the storekeeper ───────────────────────────────── */

await login(page, 'admin@cityeng.local')
await page.goto(`${BASE}/manager/users`, { waitUntil: 'domcontentloaded' })
await settled(page)

const storekeeper = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }

    const created = await (
        await fetch('/api/users', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: 'أمين المخزن',
                email: `store-${Date.now()}@cityeng.local`,
                password: 'password',
                password_confirmation: 'password',
                role: 'manager',
                job_title: 'أمين مخزن',
            }),
        })
    ).json()

    return { id: created.data?.id ?? created.id, email: created.data?.email ?? created.email }
})

check('created an office user to narrow down', Boolean(storekeeper.id))

// The matrix, through the screen an administrator actually uses.
await page.reload({ waitUntil: 'domcontentloaded' })
await settled(page)

await page.locator('button[aria-label="الصلاحيات"]').first().click()
await page.waitForSelector('[role=dialog]', { timeout: 20000 })
await page.waitForTimeout(1200)

check('the matrix opens', await sees(page, 'إرجاع لصلاحيات الدور'))
check('it explains what the colours mean', await sees(page, 'استثناء تم ضبطه يدويًا'))
check('it groups the permissions', await sees(page, 'المخزون'))

await page.keyboard.press('Escape')
await page.waitForTimeout(600)

/* ── Narrow them to inventory alone ──────────────────────── */

const narrowed = await page.evaluate(async (userId) => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }

    const catalogue = await (await fetch('/api/permissions', { headers })).json()

    // Everything off except the two that make a storekeeper.
    const keep = ['inventory.view', 'inventory.manage']
    const permissions = {}

    for (const group of catalogue.groups) {
        for (const permission of group.permissions) {
            permissions[permission.key] = keep.includes(permission.key)
        }
    }

    const response = await fetch(`/api/users/${userId}/permissions`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ permissions }),
    })

    const body = await response.json()

    return { status: response.status, effective: body.effective ?? [] }
}, storekeeper.id)

check(`permissions saved — ${narrowed.status}`, narrowed.status === 200)
check(
    `the storekeeper keeps only inventory — ${narrowed.effective.join(', ')}`,
    narrowed.effective.length === 2 &&
        narrowed.effective.includes('inventory.view') &&
        narrowed.effective.includes('inventory.manage'),
)

/* ── What they actually see ──────────────────────────────── */

await login(page, storekeeper.email)
await settled(page)

const offered = await links(page)

check(
    'المخزون is offered',
    offered.some((href) => href.startsWith('/manager/inventory')),
)
check(
    'الفواتير is not',
    !offered.includes('/manager/invoices'),
)
check(
    'المبيعات and المشتريات are not',
    !offered.includes('/manager/sales') && !offered.includes('/manager/purchasing'),
)
check('العملاء is not', !offered.includes('/manager/customers'))

/* ── And the server agrees ───────────────────────────────── */

const enforced = await page.evaluate(async () => {
    const token = localStorage.getItem('ce.token')
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    const status = async (url) => (await fetch(url, { headers })).status

    return {
        items: await status('/api/items'),
        invoices: await status('/api/invoices'),
        treasury: await status('/api/treasury/summary'),
        customers: await status('/api/customers'),
    }
})

check(`the stock list opens — ${enforced.items}`, enforced.items === 200)
check(`invoices are refused — ${enforced.invoices}`, enforced.invoices === 403)
check(`the treasury is refused — ${enforced.treasury}`, enforced.treasury === 403)
check(`customers are refused — ${enforced.customers}`, enforced.customers === 403)

/* ── Hiding is not the guard ─────────────────────────────── */

await page.goto(`${BASE}/manager/invoices`, { waitUntil: 'domcontentloaded' })
await settled(page)

// The route still renders — the role allows the office application — but the
// data behind it does not arrive. What matters is that nothing leaks.
check(
    'typing the URL in leaks no invoice data',
    !(await sees(page, 'INV-', 4000)),
)

/* ── Giving one back ─────────────────────────────────────── */

await login(page, 'admin@cityeng.local')

const restored = await page.evaluate(async (userId) => {
    const token = localStorage.getItem('ce.token')
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    }

    const response = await fetch(`/api/users/${userId}/permissions`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ permissions: { 'reports.view': true } }),
    })

    return (await response.json()).effective ?? []
}, storekeeper.id)

check(
    'a permission can be added back one at a time',
    restored.includes('reports.view') && restored.includes('inventory.view'),
)

check('no page errors', errors.length === 0)
if (errors.length) console.log(errors.slice(0, 3))

await context.close()
await browser.close()

console.log(failures === 0 ? '\npermissions work ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
