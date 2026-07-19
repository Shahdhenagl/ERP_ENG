import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:8000'
const EMAIL = 'tech3@cityeng.local'
const OLD = 'password'
const NEW = 'Str0ngerPass!2026'

const browser = await chromium.launch()

let failures = 0
const check = (label, pass) => {
    console.log(`${pass ? '✓' : '❌'} ${label}`)
    if (!pass) failures++
}

async function login(page, email, pw) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button[type=submit]')
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', pw)
    await page.click('button[type=submit]')

    return page
        .waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 15000 })
        .then(() => true)
        .catch(() => false)
}

/** Fills the password form. Submitting is opt-out because an invalid pair
 *  disables the button — clicking it would just hang. */
async function fillPassword(page, current, next, confirm, { submit = true } = {}) {
    await page.goto(`${BASE}/tech/profile`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[autocomplete=current-password]', { timeout: 15000 })
    await page.fill('input[autocomplete=current-password]', current)

    const fresh = page.locator('input[autocomplete=new-password]')
    await fresh.nth(0).fill(next)
    await fresh.nth(1).fill(confirm)

    if (!submit) {
        await page.waitForTimeout(300)

        return
    }

    // Wait on the response rather than a fixed delay — the round trip is
    // slower than it looks once validation and hashing are in the path.
    const responded = page.waitForResponse((r) => r.url().includes('/api/profile/password'), {
        timeout: 15000,
    })
    await page.locator('form:has(input[autocomplete=current-password]) button[type=submit]').click()
    await responded
    await page.waitForTimeout(600)
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()

/* ── The page is reachable for a technician ──────────────── */
check('technician signs in', await login(page, EMAIL, OLD))

await page.goto(`${BASE}/tech/profile`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
check(
    `profile page loads → ${new URL(page.url()).pathname}`,
    new URL(page.url()).pathname === '/tech/profile',
)

/* ── A wrong current password must be rejected ───────────── */
await fillPassword(page, 'totally-wrong', NEW, NEW)
check(
    'wrong current password rejected',
    (await page.locator('body').innerText()).includes('كلمة المرور الحالية غير صحيحة'),
)

/* ── A mismatched confirmation never reaches the server ──── */
await fillPassword(page, OLD, NEW, `${NEW}-different`, { submit: false })
const submitButton = page.locator('form:has(input[autocomplete=current-password]) button[type=submit]')
check('mismatch shows an inline error', (await page.locator('body').innerText()).includes('غير متطابقتين'))
check('mismatch disables submit', await submitButton.isDisabled())

/* ── The real change sticks: old fails, new works ────────── */
await fillPassword(page, OLD, NEW, NEW)
check('password change accepted', (await page.locator('body').innerText()).includes('تم تغيير كلمة المرور'))

check('old password no longer works', !(await login(page, EMAIL, OLD)))
check('new password works', await login(page, EMAIL, NEW))

/* ── Put the seed account back the way we found it ───────── */
await fillPassword(page, NEW, OLD, OLD)
check('restored to the seeded password', await login(page, EMAIL, OLD))

await context.close()
await browser.close()

console.log(failures === 0 ? '\nprofile page works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
