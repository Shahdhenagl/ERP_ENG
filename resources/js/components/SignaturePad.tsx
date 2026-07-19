import { Eraser } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface SignaturePadProps {
    /** Called with a PNG data URL, or null when cleared. */
    onChange: (dataUrl: string | null) => void
}

/**
 * Finger/stylus signature capture. Draws at devicePixelRatio so the exported
 * PNG is crisp on a phone screen.
 */
export function SignaturePad({ onChange }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const [hasInk, setHasInk] = useState(false)

    useEffect(() => {
        const canvas = canvasRef.current

        if (!canvas) return

        const ratio = window.devicePixelRatio || 1
        const rect = canvas.getBoundingClientRect()

        canvas.width = rect.width * ratio
        canvas.height = rect.height * ratio

        const context = canvas.getContext('2d')

        if (!context) return

        context.scale(ratio, ratio)
        context.lineWidth = 2.2
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.strokeStyle = '#16295c'
    }, [])

    const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()

        return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        const context = canvasRef.current?.getContext('2d')

        if (!context) return

        const { x, y } = pointAt(event)
        context.beginPath()
        context.moveTo(x, y)
        drawing.current = true
    }

    const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current) return

        const context = canvasRef.current?.getContext('2d')

        if (!context) return

        const { x, y } = pointAt(event)
        context.lineTo(x, y)
        context.stroke()
    }

    const end = () => {
        if (!drawing.current) return

        drawing.current = false
        setHasInk(true)
        onChange(canvasRef.current?.toDataURL('image/png') ?? null)
    }

    const clear = () => {
        const canvas = canvasRef.current
        const context = canvas?.getContext('2d')

        if (!canvas || !context) return

        context.clearRect(0, 0, canvas.width, canvas.height)
        setHasInk(false)
        onChange(null)
    }

    return (
        <div>
            <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-navy-200 bg-white">
                <canvas
                    ref={canvasRef}
                    className="block h-40 w-full touch-none"
                    onPointerDown={start}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerLeave={end}
                    onPointerCancel={end}
                />

                {!hasInk && (
                    <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-navy-300">
                        وقّع هنا بإصبعك
                    </p>
                )}
            </div>

            {hasInk && (
                <button
                    type="button"
                    onClick={clear}
                    className="btn-ghost mt-2 text-xs"
                >
                    <Eraser className="size-3.5" />
                    مسح التوقيع
                </button>
            )}
        </div>
    )
}
