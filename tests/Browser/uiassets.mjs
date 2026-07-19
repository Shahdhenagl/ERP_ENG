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

/* ── Manager: registry, warranty states, history ─────────── */
{
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-EG' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))

    await login(page, 'manager@cityeng.local')

    await page.goto(`${BASE}/manager/assets`, { waitUntil: 'domcontentloaded' })
    await settled(page)

    const body = await page.locator('body').innerText()
    check('registry lists the seeded devices', body.includes('APC-SLX-88213'))

    // The seed deliberately covers all three warranty states; if the UI
    // collapsed "unknown" into "expired" this is where it would show.
    check('shows an in-force warranty', body.includes('ساري'))
    check('shows an expired warranty', body.includes('منتهي'))
    check('shows an unknown warranty distinctly', body.includes('غير محدد'))

    // Warranty filter must actually narrow the list. The query keeps the previous
    // page rendered while refetching (placeholderData), so there is no spinner to
    // wait on — wait for the filtered response itself.
    const before = await page.locator('a[href^="/manager/assets/"]').count()
    const filtered = page.waitForResponse(
        (r) => r.url().includes('/api/assets') && r.url().includes('under_warranty=1'),
        { timeout: 15000 },
    )
    await page.getByText('داخل الضمان فقط').click()
    await filtered
    await page.waitForTimeout(600)
    const after = await page.locator('a[href^="/manager/assets/"]').count()
    check(`warranty filter narrows ${before} → ${after}`, after > 0 && after < before)

    // Device page carries the service history.
    await page.goto(`${BASE}/manager/assets`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    await page.locator('a[href^="/manager/assets/"]').first().click()
    await page.waitForURL(/\/manager\/assets\/\d+/, { timeout: 15000 })
    await page.waitForSelector('text=سجل الصيانة', { timeout: 15000 }).catch(() => {})
    await settled(page)

    const detail = await page.locator('body').innerText()
    check('device page opens', detail.includes('سجل الصيانة'))
    check('device page shows the owning customer', detail.includes('العميل'))

    check('no page errors', errors.length === 0)
    if (errors.length) console.log(errors.slice(0, 3))

    await context.close()
}

/* ── Technician: no registry, but their own device opens ─── */
{
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' })
    const page = await context.newPage()

    await login(page, 'tech1@cityeng.local')

    await page.goto(`${BASE}/manager/assets`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => location.pathname.startsWith('/tech'), { timeout: 15000 }).catch(() => {})
    check(
        `technician bounced off the registry → ${new URL(page.url()).pathname}`,
        new URL(page.url()).pathname.startsWith('/tech'),
    )

    // Reach a device through a job they own — the supported path. Not every job
    // has a device (a site survey happens before one exists), so walk the feed
    // until one does rather than assuming the first card.
    await page.goto(`${BASE}/tech/tasks`, { waitUntil: 'domcontentloaded' })
    await settled(page)

    const hrefs = await page.locator('a[href^="/tech/tasks/"]').evaluateAll((links) =>
        links.map((a) => a.getAttribute('href')),
    )

    let link = page.getByText('سجل الجهاز')
    for (const href of hrefs) {
        await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
        await settled(page)
        link = page.getByText('سجل الجهاز')
        if (await link.count()) break
    }

    if (await link.count()) {
        await link.first().click()
        await page.waitForURL(/\/assets\/\d+/, { timeout: 15000 })
        await page.waitForSelector('text=سجل الصيانة', { timeout: 15000 }).catch(() => {})
        await settled(page)
        check(
            `technician opens their own device → ${new URL(page.url()).pathname}`,
            new URL(page.url()).pathname.includes('/assets/'),
        )
        check('history is visible to the technician', (await page.locator('body').innerText()).includes('سجل الصيانة'))
    } else {
        check('technician task exposes a device link', false)
    }

    await context.close()
}

await browser.close()
console.log(failures === 0 ? '\nasset registry works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
