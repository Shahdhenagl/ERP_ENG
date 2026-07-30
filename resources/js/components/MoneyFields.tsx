import { Field, Select } from '@/components/ui'
import { formatMoney } from '@/lib/domain'
import { useCashBoxes, useStaff } from '@/lib/queries'

/**
 * The two questions every receipt has to answer and neither form was asking:
 * where the money landed, and who took it.
 */

/**
 * Where the money landed — drawers and bank accounts told apart.
 *
 * They were one flat list, so "which bank did the transfer go to" and "which
 * drawer holds the cash" were the same question with the answer left to
 * whoever recognised the name. Grouping is the whole fix: a bank transfer is
 * picked from the bank accounts, and a mis-posted transfer stops being one
 * mis-click away.
 */
export function CashBoxSelect({
    value,
    onChange,
    label = 'الخزينة',
    error,
    hint,
    placeholder,
    required,
}: {
    value: string
    onChange: (value: string) => void
    label?: string
    error?: string
    hint?: string
    /** Shown as the empty choice. Omit when a box must be picked. */
    placeholder?: string
    required?: boolean
}) {
    const { data: boxes } = useCashBoxes()

    const drawers = boxes?.filter((box) => box.type === 'cash') ?? []
    const banks = boxes?.filter((box) => box.type === 'bank') ?? []
    const custody = boxes?.filter((box) => box.type === 'custody') ?? []

    const option = (box: { id: number; name: string; balance: number }) => (
        <option key={box.id} value={box.id}>
            {box.name} ({formatMoney(box.balance)})
        </option>
    )

    return (
        <Field label={label} error={error} hint={hint} required={required}>
            <Select value={value} onChange={(event) => onChange(event.target.value)}>
                {placeholder !== undefined && <option value="">{placeholder}</option>}

                {drawers.length > 0 && (
                    <optgroup label="خزائن نقدية">{drawers.map(option)}</optgroup>
                )}
                {banks.length > 0 && (
                    <optgroup label="حسابات بنكية">{banks.map(option)}</optgroup>
                )}
                {custody.length > 0 && <optgroup label="عهد">{custody.map(option)}</optgroup>}
            </Select>
        </Field>
    )
}

/**
 * The employee who actually took the money.
 *
 * Left empty it is whoever is signed in, which at a desk is the truth. It
 * stops being the truth the moment a technician collects on site and the
 * office keys it in that evening — and that is exactly the receipt somebody
 * later needs to trace.
 *
 * A name on the receipt and nothing more. It posts nothing, opens no custody
 * against the person, and touches neither their float nor their pay: the money
 * lands in the box chosen above, exactly as it would with the field left
 * blank. Naming someone must not quietly make them owe something.
 */
export function CollectorSelect({
    value,
    onChange,
    label = 'الموظف المُحصِّل',
    hint = 'لبيان من استلم المبلغ فقط — لا يُقيَّد على حسابه ولا على عهدته.',
    error,
}: {
    value: string
    onChange: (value: string) => void
    label?: string
    hint?: string
    error?: string
}) {
    const { data: staff } = useStaff()

    return (
        <Field label={label} hint={hint} error={error}>
            <Select value={value} onChange={(event) => onChange(event.target.value)}>
                <option value="">— أنا —</option>
                {staff?.map((person) => (
                    <option key={person.id} value={person.id}>
                        {person.name} — {person.label}
                    </option>
                ))}
            </Select>
        </Field>
    )
}
