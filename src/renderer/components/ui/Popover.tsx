import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  /** The element the panel opens under. */
  anchor: HTMLElement | null
  label: string
  children: ReactNode
}

/** A floating panel portalled to the body, so a scrolling parent never clips it. */
export function Popover({ open, onClose, anchor, label, children }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const rect = anchor.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
  }, [open, anchor])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchor])

  if (!open || !pos) return null
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 flex w-64 flex-col gap-2 rounded border border-zinc-700 bg-zinc-900 py-2 text-xs text-zinc-300 shadow-lg"
    >
      {children}
    </div>,
    document.body
  )
}

export function PopoverSection({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 px-3">{children}</div>
}

export function PopoverNote({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-4 text-zinc-500">{children}</p>
}

export function PopoverActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1">{children}</div>
}
