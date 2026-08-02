import { Download, Table2, Upload } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Select, SkeletonCard } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import {
    downloadCustomExport,
    downloadImportTemplate,
    useDatasets,
    useImport,
    useImportDatasets,
    type ImportResult,
} from '@/lib/queries'

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
        <div className="space-y-5">
        <div className="card p-5">
            <div className="mb-4 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Table2 className="size-5" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-navy-900">تصدير بيانات خام</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-navy-500">
                        {tr('اختر جدولًا وفترة زمنية، واحصل على السجلات نفسها كملف Excel لتحليلها كما تشاء.')}
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
                    {tr('تصدير Excel')}
                </Button>
            </div>
        </div>

        <ImportCard />
        </div>
    )
}

/** The other half: fill the template and upload it back. */
function ImportCard() {
    const toast = useToast()
    const { data: datasets } = useImportDatasets()
    const doImport = useImport()

    const [entity, setEntity] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [result, setResult] = useState<ImportResult | null>(null)

    useEffect(() => {
        if (!entity && datasets?.length) setEntity(datasets[0].key)
    }, [datasets, entity])

    if (!datasets) return null

    return (
        <div className="card p-5">
            <div className="mb-4 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Upload className="size-5" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-navy-900">استيراد بيانات</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-navy-500">
                        {tr('نزّل القالب، املأه، وارفعه. الصفوف المطابقة تُحدَّث بدل ما تتكرر.')}
                    </p>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="الجدول">
                    <Select
                        value={entity}
                        onChange={(e) => {
                            setEntity(e.target.value)
                            setResult(null)
                        }}
                    >
                        {datasets.map((option) => (
                            <option key={option.key} value={option.key}>
                                {option.label}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label="ملف CSV">
                    <Input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                            setFile(e.target.files?.[0] ?? null)
                            setResult(null)
                        }}
                    />
                </Field>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => entity && void downloadImportTemplate(entity)}
                    className="tap text-xs font-bold text-brand-600"
                >
                    {tr('تنزيل القالب')}
                </button>

                <Button
                    icon={Upload}
                    loading={doImport.isPending}
                    disabled={!entity || !file}
                    onClick={async () => {
                        if (!file) return
                        try {
                            const res = await doImport.mutateAsync({ entity, file })
                            setResult(res)
                            toast.success(`تم: ${res.created} جديد، ${res.updated} محدّث.`)
                        } catch (caught) {
                            toast.error(errorMessage(caught, 'تعذّر الاستيراد.'))
                        }
                    }}
                >
                    {tr('استيراد')}
                </Button>
            </div>

            {result && (
                <div className="mt-4 rounded-xl bg-navy-50 p-3 text-xs">
                    <p className="font-bold text-navy-700">
                        جديد {result.created} · محدّث {result.updated} · متخطّى {result.skipped}
                    </p>
                    {result.errors.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-red-600">
                            {result.errors.map((error, index) => (
                                <li key={index}>{error}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}
