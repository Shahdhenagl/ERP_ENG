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
    await page.waitForTimeout(500)
}

/** Nothing may extend past the viewport — sideways drift is the loudest "web page" tell. */
async function noSidewaysScroll(page) {
    return page.evaluate(() => {
        const doc = document.documentElement
        if (doc.scrollWidth > doc.clientWidth + 1) return false

        // Find any element actually sticking out, not just a scrollable body.
        const limit = doc.clientWidth

        // A chip inside a deliberately swipeable filter strip is out of view by
        // design; only content with no scrollable ancestor is a real defect.
        const insideScroller = (el) => {
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                const o = getComputedStyle(p).overflowX
                if (o === 'auto' || o === 'scroll') return true
            }

            return false
        }

        for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect()
            if (r.width > 0 && (r.right > limit + 1 || r.left < -1)) {
                const s = getComputedStyle(el)
                if (s.overflowX === 'auto' || s.overflowX === 'scroll') continue
                if (insideScroller(el)) continue

                return false
            }
        }

        return true
    })
}

const PAGES = {
    technician: { email: 'tech1@cityeng.local', paths: ['/tech', '/tech/tasks', '/tech/profile'] },
    manager: {
        email: 'manager@cityeng.local',
        paths: ['/manager', '/manager/tasks', '/manager/customers', '/manager/assets', '/manager/tasks/new'],
    },
}

for (const [role, { email, paths }] of Object.entries(PAGES)) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' })
    const page = await context.newPage()
    await login(page, email)

    for (const path of paths) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
        await settled(page)
        check(`${role} ${path.padEnd(20)} fits the viewport`, await noSidewaysScroll(page))
    }

    // Task detail carries the status stepper — the widest thing in the app.
    const feed = role === 'technician' ? '/tech/tasks' : '/manager/tasks'
    await page.goto(`${BASE}${feed}`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    // `/tasks/new` also matches that prefix and is hidden on mobile.
    await page.locator(`a[href^="${feed}/"]:not([href$="/new"])`).first().click()
    await page.waitForURL(new RegExp(`${feed}/\\d+`), { timeout: 15000 })
    // Wait on the stepper itself: the loader can be absent for a frame between
    // navigation and mount, which lets a "settled" check read an empty page.
    const stepper = await page
        .waitForSelector('text=مسار المهمة', { timeout: 20000 })
        .then(() => true)
        .catch(() => false)
    await settled(page)
    check(`${role} task detail fits the viewport`, await noSidewaysScroll(page))
    check(`${role} sees the status stepper`, stepper)

    await context.close()
}

/* ── The avatar replaced the hamburger ───────────────────── */
{
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' })
    const page = await context.newPage()
    await login(page, 'tech1@cityeng.local')
    await settled(page)

    const avatar = page.getByLabel('الحساب والقائمة')
    check('avatar button is the menu trigger', (await avatar.count()) === 1)

    await avatar.click()
    await page.waitForTimeout(600)
    check('avatar opens the drawer', (await page.locator('body').innerText()).includes('تسجيل الخروج'))

    await context.close()
}

/* ── Zoom is off ─────────────────────────────────────────── */
{
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

    const viewport = await page.getAttribute('meta[name=viewport]', 'content')
    check(`viewport locks zoom → ${viewport}`, /user-scalable=no/.test(viewport ?? ''))

    const touchAction = await page.evaluate(() => getComputedStyle(document.body).touchAction)
    check(`body touch-action is ${touchAction}`, touchAction === 'manipulation')

    await context.close()
}

await browser.close()
console.log(failures === 0 ? '\nnative feel holds ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
