import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8000'
const OUT = process.env.SHOT_DIR ?? 'storage/app/screenshots'
mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch()

async function makePage(viewport) {
    const context = await browser.newContext({ viewport, locale: 'ar-EG' })
    const page = await context.newPage()
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`) })
    return { context, page }
}

/** Wait until React has finished rendering data (no skeletons, no spinners). */
async function settled(page) {
    await page
        .waitForFunction(
            () => !document.querySelector('.shimmer') && !document.querySelector('.animate-spin'),
            { timeout: 20000 },
        )
        .catch(() => {})
    await page.waitForTimeout(500)
}

async function login(page, email) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    // React Router navigates on the client, so wait for the form to hydrate
    // and then for the dashboard heading rather than a page load event.
    await page.waitForSelector('button[type=submit]', { timeout: 15000 })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', 'password')
    await page.click('button[type=submit]')
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 })
    await settled(page)
}

/* â”€â”€ Desktop / manager â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
{
    const { context, page } = await makePage({ width: 1440, height: 900 })

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.screenshot({ path: `${OUT}/01-login.png` })
    console.log('âœ“ login page')

    await login(page, 'manager@cityeng.local')
    // Wait for the skeletons to be replaced by real numbers.
    await page.waitForFunction(() => !document.querySelector('.shimmer') && !document.querySelector('.animate-spin'), { timeout: 15000 })
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${OUT}/02-dashboard.png`, fullPage: true })
    console.log('âœ“ manager dashboard â€”', await page.locator('h1').first().innerText())

    await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    await page.screenshot({ path: `${OUT}/03-tasks.png`, fullPage: true })
    const cards = await page.locator('a[href^="/tasks/"]:not([href$="/new"])').count()
    console.log('âœ“ task list â€” cards:', cards)

    const first = page.locator('a[href^="/tasks/"]:not([href$="/new"])').first()
    await first.click()
    await page.waitForTimeout(300)
    await settled(page)
    await page.screenshot({ path: `${OUT}/04-task-detail.png`, fullPage: true })
    console.log('âœ“ task detail â€”', await page.locator('h1').first().innerText())

    await page.goto(`${BASE}/customers`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    await page.screenshot({ path: `${OUT}/05-customers.png`, fullPage: true })
    console.log('âœ“ customers')

    await page.goto(`${BASE}/tasks/new`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    await page.screenshot({ path: `${OUT}/06-task-new.png`, fullPage: true })
    console.log('âœ“ new task form')

    await context.close()
}

/* â”€â”€ Mobile / technician â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
{
    const { context, page } = await makePage({ width: 390, height: 844 })

    await login(page, 'tech1@cityeng.local')
    await page.screenshot({ path: `${OUT}/07-mobile-dashboard.png`, fullPage: true })
    console.log('âœ“ technician mobile dashboard')

    await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    await page.screenshot({ path: `${OUT}/08-mobile-tasks.png`, fullPage: true })
    console.log('âœ“ technician task feed â€” cards:', await page.locator('a[href^="/tasks/"]:not([href$="/new"])').count())

    const first = page.locator('a[href^="/tasks/"]:not([href$="/new"])').first()
    if (await first.count()) {
        await first.click()
        await page.waitForTimeout(300)
        await settled(page)
        await page.screenshot({ path: `${OUT}/09-mobile-detail.png`, fullPage: true })
        console.log('âœ“ technician task detail')
    }

    // Technician must NOT be able to reach the admin screens.
    await page.goto(`${BASE}/users`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    console.log('âœ“ /users as technician redirected to:', new URL(page.url()).pathname)

    await context.close()
}

/* â”€â”€ Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
{
    const { context, page } = await makePage({ width: 1440, height: 900 })
    await login(page, 'admin@cityeng.local')
    await page.goto(`${BASE}/users`, { waitUntil: 'domcontentloaded' })
    await settled(page)
    await page.screenshot({ path: `${OUT}/10-users.png`, fullPage: true })
    console.log('âœ“ admin users page')
    await context.close()
}

await browser.close()

console.log('\nâ”€â”€â”€ errors â”€â”€â”€')
if (errors.length === 0) {
    console.log('none ðŸŽ‰')
} else {
    // Favicon noise is not interesting.
    const real = errors.filter((e) => !e.includes('favicon'))
    real.slice(0, 25).forEach((e) => console.log(e))
    console.log(`total: ${real.length}`)
}






