import { useRef, type PointerEvent } from 'react'

interface Props {
  levels: readonly string[]
  value: string | undefined
  onSelect: (level: string) => void
  label: string
  tooltip?: string
}

/** A notched track to pick one of a few ordered levels by clicking or dragging. */
export function LevelSlider({ levels, value, onSelect, label, tooltip }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const at = value ? levels.indexOf(value) : -1
  const percent = (i: number): number => (levels.length < 2 ? 50 : (i / (levels.length - 1)) * 100)

  const pickAt = (clientX: number): void => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    const next = levels[Math.round(ratio * (levels.length - 1))]
    if (next !== value) onSelect(next)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    pickAt(e.clientX)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (dragging.current) pickAt(e.clientX)
  }
  const stop = (): void => {
    dragging.current = false
  }

  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={levels.length - 1}
      aria-valuenow={at === -1 ? undefined : at}
      aria-valuetext={value}
      tabIndex={-1}
      title={tooltip}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      className="flex h-4 w-20 shrink-0 cursor-pointer items-center px-1.5"
    >
      <div ref={trackRef} className="relative h-0.5 w-full rounded-full bg-strong">
        {levels.map((level, i) => (
          <span
            key={level}
            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted"
            style={{ left: `${percent(i)}%` }}
          />
        ))}
        {at !== -1 && (
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
            style={{ left: `${percent(at)}%` }}
          />
        )}
      </div>
    </div>
  )
}
