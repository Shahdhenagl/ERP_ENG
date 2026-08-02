import { Building2, Check, Search, X } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useState } from 'react'
import { Field, Input, Select } from '@/components/ui'
import { useCustomer, useCustomerBranches, useCustomers } from '@/lib/queries'

/**
 * Who the document is for, and which of their sites.
 *
 * A dropdown of every customer stops being usable at a few hundred rows, and it
 * cannot answer "which branch" at all — so this searches by name first, then
 * offers that customer's branches. A customer with a single site never sees the
 * second question.
 */
export function CustomerSitePicker({
    customerId,
    branchId,
    onChange,
    customerError,
    branchError,
    disabled,
}: {
    customerId: string
    branchId: string
    /** Both ids together: changing the customer must clear the site. */
    onChange: (next: { customerId: string; branchId: string }) => void
    customerError?: string
    branchError?: string
    disabled?: boolean
}) {
    const [search, setSearch] = useState('')
    const [siteSearch, setSiteSearch] = useState('')

    // Searching is the point, so the page size is small — the list is a
    // shortlist to pick from, not the customer book.
    const { data: page, isFetching } = useCustomers({
        active_only: 1,
        search: search || undefined,
        per_page: 25,
    })
    const customers = page?.data ?? []

    const { data: branchList } = useCustomerBranches(
        customerId ? Number(customerId) : undefined,
    )
    const branches = (branchList ?? []).filter((branch) => branch.is_active)

    // Filtered in the browser: the whole list is already here, and a round trip
    // per keystroke would be slower than the typing.
    const term = siteSearch.trim().toLowerCase()
    const matchingBranches = term
        ? branches.filter(
              (branch) =>
                  branch.name.toLowerCase().includes(term)
                  || (branch.city ?? '').toLowerCase().includes(term),
          )
        : branches

    // Read on its own rather than looked up in the visible list: reopening a
    // saved document has no search behind it, so the name would come up blank.
    const { data: chosen } = useCustomer(customerId || undefined)

    return (
        <div className="space-y-4">
            <Field label="العميل" required error={customerError}>
                {customerId ? (
                    <div className="flex items-center gap-2 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-200">
                        <Check className="size-4 shrink-0 text-brand-600" />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy-900">
                            {chosen?.name ?? 'العميل المختار'}
                        </span>
                        {! disabled && (
                            <button
                                type="button"
                                onClick={() => {
                                    onChange({ customerId: '', branchId: '' })
                                    setSearch('')
                                }}
                                className="tap grid shrink-0 place-items-center rounded-lg p-1.5 text-navy-400 transition hover:bg-surface hover:text-navy-700"
                                aria-label="تغيير العميل"
                            >
                                <X className="size-4" />
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-navy-300" />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="ابحث باسم العميل…"
                                className="pr-9"
                                disabled={disabled}
                            />
                        </div>

                        <div className="mt-2 max-h-52 overflow-y-auto rounded-xl ring-1 ring-navy-100">
                            {customers.length === 0 ? (
                                <p className="p-3 text-center text-xs text-navy-400">
                                    {isFetching ? 'جارٍ البحث…' : 'لا يوجد عميل بهذا الاسم.'}
                                </p>
                            ) : (
                                customers.map((customer) => (
                                    <button
                                        key={customer.id}
                                        type="button"
                                        onClick={() =>
                                            onChange({ customerId: String(customer.id), branchId: '' })
                                        }
                                        className="tap flex w-full items-center gap-2 border-b border-navy-50 p-2.5 text-start transition last:border-0 hover:bg-navy-50"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-navy-800">
                                                {customer.name}
                                            </span>
                                            {customer.company && (
                                                <span className="block truncate text-[11px] text-navy-400">
                                                    {customer.company}
                                                </span>
                                            )}
                                        </span>
                                        <span className="tabular shrink-0 text-[11px] text-navy-400">
                                            {customer.code}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                )}
            </Field>

            {/* Only asked where there is a choice to make. A customer with a
                handful of sites needs no search; one with thirty does, and the
                same box serves both. */}
            {customerId && branches.length > 0 && (
                <Field
                    label="الفرع"
                    error={branchError}
                    hint="اترك الاختيار فارغًا لو العرض للمقر الرئيسي."
                >
                    {branches.length > 8 && (
                        <div className="relative mb-2">
                            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-navy-300" />
                            <Input
                                value={siteSearch}
                                onChange={(event) => setSiteSearch(event.target.value)}
                                placeholder="ابحث باسم الفرع…"
                                className="pr-9"
                                disabled={disabled}
                            />
                        </div>
                    )}

                    <Select
                        value={branchId}
                        onChange={(event) => onChange({ customerId, branchId: event.target.value })}
                        disabled={disabled}
                    >
                        <option value="">— المقر الرئيسي —</option>
                        {matchingBranches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                                {branch.name}
                                {branch.city ? ` — ${branch.city}` : ''}
                            </option>
                        ))}
                    </Select>

                    {siteSearch && matchingBranches.length === 0 && (
                        <p className="mt-1 text-[11px] text-navy-400">لا يوجد فرع بهذا الاسم.</p>
                    )}
                </Field>
            )}

            {customerId && branches.length === 0 && (
                <p className="flex items-center gap-1.5 text-[11px] text-navy-400">
                    <Building2 className="size-3.5" />
                    {tr('لا توجد فروع مسجّلة لهذا العميل.')}
                </p>
            )}
        </div>
    )
}
