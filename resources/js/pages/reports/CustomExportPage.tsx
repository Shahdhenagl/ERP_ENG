import { Download, Table2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { downloadCustomExport, useDatasets } from '@/lib/queries'

/**
 * التقارير المخصصة — the raw rows of a dataset, handed over to be cut however
 * the reader needs.
 *
 * The fixed reports aggregate; this does the opposite. Pick a table and a
 * window, and get the records themselves as a spreadsheet — the honest answer to
 * "custom reports" that a query builder nobody can verify only pretends to give.
 */
export function CustomExportPage() {
    const toast = useToast()
    const { data: datasets, isLoading } = useDatasets()

    const [dataset, setDataset] = useState('')
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [exporting, setExporting] = useState(false)

    // Land on the first dataset once the list arrives.
    useEffect(() => {
        if (!dataset && datasets?.length) setDataset(datasets[0].key)
    }, [datasets, dataset])

    if (isLoading || !datasets) return <SkeletonCard />

    const run = async () => {
        setExporting(true)
        try {
            await downloadCustomExport(dataset, { from: from || undefined, to: to || undefined })
        } catch (caught) {
            toast.error(errorMessage(caught, 'تعذّر التصدير.'))
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className="card p-5">
            <div className="mb-4 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Table2 className="size-5" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-navy-900">تصدير بيانات خام</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-navy-500">
                        اختر جدولًا وفترة زمنية، واحصل على السجلات نفسها كملف Excel لتحليلها كما تشاء.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <Field label="الجدول">
                    <Select value={dataset} onChange={(e) => setDataset(e.target.value)}>
                        {datasets.map((option) => (
                            <option key={option.key} value={option.key}>
                                {option.label}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="من تاريخ" hint="اتركه فارغًا للكل">
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field label="إلى تاريخ">
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </Field>
            </div>

            <div className="mt-5 flex justify-end">
                <Button icon={Download} loading={exporting} disabled={!dataset} onClick={run}>
                    تصدير Excel
                </Button>
            </div>
        </div>
    )
}
