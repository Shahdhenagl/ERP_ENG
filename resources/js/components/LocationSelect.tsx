import { useState } from 'react'
import { Field, Input, Select } from '@/components/ui'
import { EGYPT_GOVERNORATES, GOVERNORATE_NAMES } from '@/lib/egypt'

/** The district select's escape hatch, for an address the library lacks. */
const OTHER = '__other'

/**
 * The cascading address picker: a governorate, then its district.
 *
 * Both are real selects. The district was a datalist-backed input, which left
 * the browser drawing its own unstyled popup beside the app's own controls, and
 * a district from the previous governorate stayed in the box after switching —
 * so the field read as belonging to a governorate that no longer had it.
 *
 * Switching governorate now clears a district that does not belong to the new
 * one, and keeps it when it does. An address the library does not carry is
 * still typeable through "أخرى".
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
    const districts = EGYPT_GOVERNORATES[governorate] ?? []

    // A value entered before the library existed, or one it does not carry.
    const isOffList = Boolean(district) && !districts.includes(district)
    const [typing, setTyping] = useState(isOffList)

    const showFreeText = typing || isOffList || districts.length === 0

    return (
        <>
            <Field label="المحافظة" error={errors?.governorate}>
                <Select
                    value={governorate}
                    onChange={(event) => {
                        const next = event.target.value
                        const nextDistricts = EGYPT_GOVERNORATES[next] ?? []

                        onGovernorate(next)

                        // A markaz does not follow its governorate to another
                        // one: keep it only where it still exists.
                        if (district && !nextDistricts.includes(district)) {
                            onDistrict('')
                            setTyping(false)
                        }
                    }}
                >
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
                {districts.length > 0 && (
                    <Select
                        value={showFreeText ? OTHER : district}
                        onChange={(event) => {
                            if (event.target.value === OTHER) {
                                setTyping(true)
                                onDistrict('')

                                return
                            }

                            setTyping(false)
                            onDistrict(event.target.value)
                        }}
                    >
                        <option value="">— اختر الحي / المركز —</option>
                        {districts.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                        <option value={OTHER}>أخرى — اكتبه يدويًا</option>
                    </Select>
                )}

                {showFreeText && (
                    <Input
                        value={district}
                        onChange={(event) => onDistrict(event.target.value)}
                        placeholder={governorate ? 'اكتب الحي أو المركز' : 'اختر المحافظة أولًا'}
                        className={districts.length > 0 ? 'mt-2' : undefined}
                    />
                )}
            </Field>
        </>
    )
}
