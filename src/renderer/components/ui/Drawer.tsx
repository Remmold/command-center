import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'
import { overlayOpen } from './overlay'
import { SectionLabel } from './SectionLabel'
import { clampDrawerShare } from './drawerShare'

/** Lays content and a docked Drawer side by side. */
export function DrawerHost({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 min-w-0 bg-editor">{children}</div>
}

/** The main region beside a docked Drawer. */
export function DrawerMain({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 py-2">{children}</div>
}

interface Props {
  label: string
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /** Share of the host's width, kept between minWidth and 80 %. */
  share: number
  minWidth: number
  onResize: (share: number) => void
  /** Buttons in the header, before Close. */
  actions?: ReactNode
  /** The body fills the drawer edge to edge and scrolls itself, for content such as a chat. */
  flush?: boolean
}

export function Drawer({ label, title, onClose, children, share, minWidth, onResize, actions, flush = false }: Props) {
  const panel = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented && !overlayOpen()) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const startResize = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const host = panel.current?.parentElement
    if (!host) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => {
      const rect = host.getBoundingClientRect()
      const next = (rect.right - ev.clientX) / rect.width
      onResize(clampDrawerShare(next, minWidth, rect.width))
    }
    const stop = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('lostpointercapture', stop)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('lostpointercapture', stop)
  }

  return (
    <aside
      ref={panel}
      aria-label={label}
      style={{ width: `${share * 100}%`, minWidth }}
      className="relative flex h-full max-w-[80%] shrink-0 flex-col border-l border-subtle bg-editor"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={startResize}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-focus"
      />
      <header className="flex shrink-0 items-start gap-2 border-b border-subtle px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">{title}</div>
        {actions}
        <Button variant="ghost" onClick={onClose} label="Close" tooltip="Close (Esc)">
          <X size={14} />
        </Button>
      </header>
      {flush ? (
        <div className="relative min-h-0 flex-1">{children}</div>
      ) : (
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">{children}</div>
      )}
    </aside>
  )
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5">
      <SectionLabel as="h3">{title}</SectionLabel>
      {children}
    </section>
  )
}

export function DrawerText({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-fg">{children}</p>
}

export function DrawerList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-0.5">{children}</ul>
}
