/**
 * The groups the sidebar nests, defined once.
 *
 * Only an admin gets a sidebar, so for everyone else these same lists are what
 * `SectionTabs` renders at the top of each page. Grouping a module under a
 * parent without putting it in one of these lists would hide it from managers
 * completely — the bottom bar carries top-level destinations alone.
 *
 * Kept here rather than in the pages because each list appears on every page in
 * its group, and three copies of the same array is how one of them ends up
 * missing an entry.
 */

/** الأجهزة and the promises made about them. */
export const DEVICE_SECTIONS = [
    ['/assets', 'الأجهزة'],
    ['/contracts', 'عقود الصيانة'],
    ['/warranties', 'الضمانات'],
] as const

/** The money group: what is owed, what is held, and the books behind both. */
export const MONEY_SECTIONS = [
    ['/invoices', 'الفواتير'],
    ['/treasury', 'الخزينة'],
    ['/cheques', 'الشيكات'],
    ['/accounting', 'المحاسبة'],
] as const

/** الإدارة: the system administrator's own screens. */
export const ADMIN_SECTIONS = [
    ['/users', 'المستخدمون'],
    ['/audit', 'سجل العمليات'],
    ['/settings', 'بيانات الشركة'],
] as const
