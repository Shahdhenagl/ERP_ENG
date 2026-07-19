import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:8000'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()

let failures = 0
const check = (label, pass, extra = '') => {
    console.log(`${pass ? '✓' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`)
    if (!pass) failures++
}

async function login(email) {
    // Drop any existing session, otherwise /login just redirects home.
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.removeItem('ce.token'))
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button[type=submit]')
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', 'password')
    await page.click('button[type=submit]')
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 })
}

const call = (path, options = {}) =>
    page.evaluate(
        async ([p, o]) => {
            const token = localStorage.getItem('ce.token')
            const res = await fetch(p, {
                ...o,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    ...(o.body ? { 'Content-Type': 'application/json' } : {}),
                    ...(o.headers ?? {}),
                },
            })
            return { status: res.status, body: await res.json().catch(() => null) }
        },
        [path, options],
    )

/* ── Manager: create a customer and a job, in Arabic ────── */
await login('manager@cityeng.local')

const customerName = 'مستشفى دار الشفاء التخصصي'
const created = await call('/api/customers', {
    method: 'POST',
    body: JSON.stringify({
        name: customerName,
        company: 'دار الشفاء الطبية',
        phone: '01555000111',
        address: 'شارع الهرم، الجيزة',
        lat: 29.9871,
        lng: 31.1313,
    }),
})
check('manager creates customer', created.status === 201, `code ${created.body?.code}`)
check(
    'Arabic round-trips intact',
    created.body?.name === customerName,
    created.body?.name,
)

const jobTitle = 'صيانة طارئة — الجهاز يفصل تحت الحمل'
const task = await call('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
        customer_id: created.body.id,
        assigned_to: 3, // محمود سعيد
        title: jobTitle,
        description: 'العميل أبلغ أن الجهاز يفصل عند تشغيل المكيفات.',
        type: 'repair',
        priority: 'urgent',
        device_brand: 'APC',
        device_serial: 'APC-TEST-99001',
    }),
})
check('manager creates job', task.status === 201, task.body?.code)
check('job title Arabic intact', task.body?.title === jobTitle)
check('site inherited from customer', task.body?.site_lat === 29.9871, `lat ${task.body?.site_lat}`)

const taskId = task.body.id

/* ── Technician drives it to completion ─────────────────── */
await login('tech1@cityeng.local')

const detail = await call(`/api/tasks/${taskId}`)
check('technician sees the assigned job', detail.status === 200, detail.body?.data?.code)
check(
    'navigation link built',
    Boolean(detail.body?.data?.navigation_url?.includes('29.9871')),
)

for (const status of ['accepted', 'on_the_way', 'in_progress']) {
    const res = await call(`/api/tasks/${taskId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, lat: 30.01, lng: 31.2 }),
    })
    check(`status → ${status}`, res.status === 200 && res.body?.data?.status === status)
}

// Closing without a report must still be possible via API, but the UI blocks
// it; here we file the report first, as the technician would.
const findings = 'المروحة الداخلية متوقفة وحرارة الجهاز مرتفعة.'
const report = await call(`/api/tasks/${taskId}/reports`, {
    method: 'POST',
    body: JSON.stringify({
        type: 'completion',
        input_voltage: 219.4,
        output_voltage: 230,
        load_percent: 78.5,
        battery_voltage: 268.2,
        backup_minutes: 9,
        device_condition: 'poor',
        batteries_need_replacement: true,
        findings,
        actions_taken: 'تم استبدال المروحة وتنظيف المرشحات.',
        recommendations: 'استبدال بنك البطاريات خلال شهر.',
        parts_used: [{ name: 'مروحة تبريد 120mm', qty: 1 }],
        signed_by_name: 'م. هشام عادل',
    }),
})
check('completion report filed', report.status === 201)
check('report Arabic intact', report.body?.findings === findings, report.body?.findings)
check('battery flag captured', report.body?.batteries_need_replacement === true)

const done = await call(`/api/tasks/${taskId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'completed' }),
})
check('status → completed', done.status === 200 && done.body?.data?.status === 'completed')

// Terminal state must be terminal.
const reopen = await call(`/api/tasks/${taskId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'in_progress' }),
})
check('cannot reopen a completed job', reopen.status === 422)

/* ── The trail the manager relies on ────────────────────── */
const final = await call(`/api/tasks/${taskId}`)
const logs = final.body?.data?.status_logs ?? []
check('status trail recorded', logs.length === 4, `${logs.length} entries`)
check('GPS stamped on transitions', logs.some((l) => l.lat === 30.01))
check(
    'WhatsApp report link built for the manager',
    Boolean(final.body?.data?.whatsapp?.report_manager?.startsWith('https://wa.me/')),
)

/* ── Manager sees the completion notification ───────────── */
await login('manager@cityeng.local')
const notifications = await call('/api/notifications')
const relevant = (notifications.body?.data ?? []).filter((n) => n.data?.task_id === taskId)
check('manager notified of the job', relevant.length > 0, `${relevant.length} notification(s)`)

await browser.close()
console.log(failures === 0 ? '\nend-to-end flow works ✅' : `\n${failures} check(s) failed ❌`)
process.exit(failures === 0 ? 0 : 1)
