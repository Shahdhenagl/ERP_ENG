import { useMemo, useState } from 'react'
import { Field, Input } from '@/components/ui'
import { useBranches } from '@/lib/queries'
import type { Branch } from '@/types'

export function TransportBranchPicker({
    value,
    onChange,
    error,
}: {
    value: number[]
    onChange: (value: number[]) => void
    error?: string
}) {
    const [search, setSearch] = useState('')
    const { data: branches } = useBranches({ active_only: 1 })
    const visibleBranches = useMemo(() => {
        const term = search.trim().toLocaleLowerCase()
        if (!term) return branches ?? []

        return (branches ?? []).filter((branch: Branch) =>
            [branch.name, branch.customer, branch.label, branch.code]
                .filter(Boolean)
                .some((item) => String(item).toLocaleLowerCase().includes(term)),
        )
    }, [branches, search])

    return (
        <Field
            label="الفروع المرتبطة بعهدة الانتقالات"
            required
            error={error}
            hint="يمكن اختيار فرع واحد أو أكثر، سواء كان من فروع الزيارات أو أي فرع آخر."
        >
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-brand-800">تم اختيار {value.length} فرع</span>
                    {value.length > 0 && (
                        <button
                            type="button"
                            className="text-[11px] font-bold text-red-600 hover:text-red-700"
                            onClick={() => onChange([])}
                        >
                            مسح الاختيار
                        </button>
                    )}
                </div>
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ابحث باسم الفرع أو العميل…"
                    aria-label="بحث في الفروع"
                    className="mb-2 bg-white"
                />
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg bg-white p-1 ring-1 ring-brand-100">
                    {visibleBranches.map((branch) => {
                        const checked = value.includes(branch.id)

                        return (
                            <label
                                key={branch.id}
                                className="flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-xs transition hover:bg-brand-50"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onChange(
                                        checked
                                            ? value.filter((id) => id !== branch.id)
                                            : [...value, branch.id],
                                    )}
                                    className="mt-0.5 size-4 accent-brand-600"
                                />
                                <span className="min-w-0">
                                    <span className="block truncate font-bold text-navy-800">{branch.name}</span>
                                    <span className="block truncate text-[11px] text-navy-400">
                                        {branch.customer ?? branch.code}
                                    </span>
                                </span>
                            </label>
                        )
                    })}
                    {!visibleBranches.length && (
                        <p className="p-3 text-center text-xs text-navy-400">لا توجد فروع نشطة مطابقة للبحث.</p>
                    )}
                </div>
            </div>
        </Field>
    )
}

export default TransportBranchPicker
