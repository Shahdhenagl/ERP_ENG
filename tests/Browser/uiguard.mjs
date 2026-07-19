import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:8000'
const browser = await chromium.launch()

async function session(email, viewport = { width: 390, height: 844 }) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button[type=submit]')
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', 'password')
    await page.click('button[type=submit]')
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 })
    return { context, page }
}

let failures = 0
const check = (label, pass) => {
    console.log(`${pass ? '✓' : '❌'} ${label}`)
    if (!pass) failures++
}

/* ── Technician must not reach dispatcher screens ───────── */
{
    const { context, page } = await session('tech1@cityeng.local')

    for (const path of ['/manager/users', '/manager/customers', '/manager/tasks/new']) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
        // Wait for the auth check to settle before judging.
        await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(800)

        const landed = new URL(page.url()).pathname
        const body = await page.locator('body').innerText()
        check(
            `technician ${path.padEnd(20)} → ${landed}`,
            landed.startsWith('/tech') && !body.includes('مستخدم جديد') && !body.includes('عميل جديد'),
        )
    }

    // Direct API probe for a job assigned to someone else.
    const status = await page.evaluate(async () => {
        const token = localStorage.getItem('ce.token')
        const res = await fetch('/api/tasks/3', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
        return res.status
    })
    check(`technician GET /api/tasks/3 (not theirs) → ${status}`, status === 403)

    // And creating work is dispatcher-only.
    const createStatus = await page.evaluate(async () => {
        const token = localStorage.getItem('ce.token')
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: 1, title: 'x', type: 'repair', priority: 'low' }),
        })
        return res.status
    })
    check(`technician POST /api/tasks → ${createStatus}`, createStatus === 403)

    await context.close()
}

/* ── Manager may dispatch but not administer users ──────── */
{
    const { context, page } = await session('manager@cityeng.local', { width: 1440, height: 900 })

    await page.goto(`${BASE}/manager/users`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)
    check(
        `manager /manager/users → ${new URL(page.url()).pathname}`,
        new URL(page.url()).pathname !== '/manager/users',
    )

    const status = await page.evaluate(async () => {
        const token = localStorage.getItem('ce.token')
        const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
        return res.status
    })
    check(`manager GET /api/users → ${status}`, status === 403)

    await context.close()
}

await browser.close()
console.log(failures === 0 ? '\nall access controls hold ✅' : `\n${failures} control(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
