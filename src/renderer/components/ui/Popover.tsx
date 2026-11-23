import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  /** The element the panel opens under. */
  anchor: HTMLElement | null
  label: string
  /** `end` lines the panel's right edge up with the anchor's, for buttons near the window's right side. */
  align?: 'start' | 'end'
  /** `above` opens upward, for anchors at the bottom of the window. */
  side?: 'below' | 'above'
  width?: number
  children: ReactNode
}

const PANEL_WIDTH = 256
const EDGE_GAP = 8

/** A floating panel portalled to the body, so a scrolling parent never clips it. */
export function Popover({ open, onClose, anchor, label, align = 'start', side = 'below', width = PANEL_WIDTH, children }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const rect = anchor.getBoundingClientRect()
    const left = align === 'end' ? rect.right - width : rect.left
    setPos(side === 'above' ? { bottom: window.innerHeight - rect.top + 4, left } : { top: rect.bottom + 4, left })
  }, [open, anchor, align, side, width])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel || pos?.top === undefined) return
    const overflow = panel.getBoundingClientRect().height + pos.top - (window.innerHeight - EDGE_GAP)
    panel.style.top = `${Math.max(EDGE_GAP, pos.top - Math.max(0, overflow))}px`
  }, [pos, children])

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
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 flex max-h-[80vh] flex-col gap-2 overflow-y-auto rounded border border-strong bg-widget py-2 text-xs text-fg shadow-lg"
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
  return <p className="text-[11px] leading-4 text-muted">{children}</p>
}

export function PopoverActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1">{children}</div>
}

/** A menu's title with a keyboard hint on the right. */
export function PopoverHeading({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 text-[11px] text-muted">
      <span className="font-semibold uppercase tracking-wide">{title}</span>
      {hint && <span>{hint}</span>}
    </div>
  )
}

export function PopoverMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="menu" aria-label={label} className="flex flex-col">
      {children}
    </div>
  )
}

export function PopoverDivider() {
  return <div role="separator" className="border-t border-subtle" />
}
