import { ShieldPlus } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { SectionTabs } from '@/components/SectionTabs'
import { Button, PageHeader } from '@/components/ui'
import { useWarranties, useWarrantyClaims } from '@/lib/queries'
import { WarrantyForm } from '@/pages/warranty/WarrantyForm'

/**
 * The shell both warranty sections sit in.
 *
 * Registering cover is the action that belongs to the module rather than to
 * either list, so it lives here and both children can trigger it.
 */

interface WarrantyContext {
    openRegister: (assetId?: number) => void
}

export function useWarrantyModule(): WarrantyContext {
    return useOutletContext<WarrantyContext>()
}

const SECTIONS = [
    ['/warranties/register', 'سجل الضمانات'],
    ['/warranties/claims', 'مطالبات الضمان'],
] as const

export function WarrantyLayout() {
    const [registering, setRegistering] = useState<{ assetId?: number } | null>(null)

    // Two counts worth carrying in the header: cover about to lapse is money
    // waiting to be asked for, and an open claim is a customer waiting.
    const { data: expiring } = useWarranties({ expiring_within: 60, per_page: 1 })
    const { data: open } = useWarrantyClaims({ open: 1, per_page: 1 })

    const subtitle = [
        expiring?.meta.total ? `${expiring.meta.total} ضمان يقارب على الانتهاء` : null,
        open?.meta.total ? `${open.meta.total} بلاغ مفتوح` : null,
    ]
        .filter(Boolean)
        .join(' · ')

    return (
        <>
            <PageHeader
                title="الضمانات"
                subtitle={subtitle || undefined}
                actions={
                    <Button icon={ShieldPlus} onClick={() => setRegistering({})}>
                        تسجيل ضمان
                    </Button>
                }
            />

            <SectionTabs sections={SECTIONS} />

            <Outlet
                context={
                    {
                        openRegister: (assetId?: number) => setRegistering({ assetId }),
                    } satisfies WarrantyContext
                }
            />

            {registering && (
                <WarrantyForm
                    assetId={registering.assetId}
                    onClose={() => setRegistering(null)}
                />
            )}
        </>
    )
}
