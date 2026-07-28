import { useId } from 'react'
import { Field, Input, Select } from '@/components/ui'
import { EGYPT_GOVERNORATES, GOVERNORATE_NAMES } from '@/lib/egypt'

/**
 * The cascading address picker: a governorate, then its district. The district
 * is a datalist-backed input rather than a hard select, so the markaz/qism list
 * suggests without trapping — an address the library does not carry can still
 * be typed. Choosing a governorate does not wipe a district already entered,
 * which matters when editing an existing record.
 */
export function LocationSelect({
    governorate,
    district,
    onGovernorate,
    onDistrict,
    errors,
}: {
    governorate: string
    district: string
    onGovernorate: (value: string) => void
    onDistrict: (value: string) => void
    errors?: { governorate?: string; city?: string }
}) {
    const listId = useId()
    const districts = EGYPT_GOVERNORATES[governorate] ?? []

    return (
        <>
            <Field label="المحافظة" error={errors?.governorate}>
                <Select value={governorate} onChange={(e) => onGovernorate(e.target.value)}>
                    <option value="">— اختر المحافظة —</option>
                    {GOVERNORATE_NAMES.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                    {/* Keep a custom value that predates the library selectable. */}
                    {governorate && !GOVERNORATE_NAMES.includes(governorate) && (
                        <option value={governorate}>{governorate}</option>
                    )}
                </Select>
            </Field>

            <Field label="الحي / المركز" error={errors?.city}>
                <Input
                    value={district}
                    onChange={(e) => onDistrict(e.target.value)}
                    list={districts.length ? listId : undefined}
                    placeholder={governorate ? 'اختر أو اكتب الحي' : 'اختر المحافظة أولًا'}
                />
                {districts.length > 0 && (
                    <datalist id={listId}>
                        {districts.map((d) => (
                            <option key={d} value={d} />
                        ))}
                    </datalist>
                )}
            </Field>
        </>
    )
}
