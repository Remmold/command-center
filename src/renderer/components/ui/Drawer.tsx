import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'
import { SectionLabel } from './SectionLabel'

/** Positions a Drawer over its content. */
export function DrawerHost({ children }: { children: ReactNode }) {
  return <div className="relative flex h-full flex-col gap-2 bg-zinc-950 pt-2">{children}</div>
}

interface Props {
  label: string
  title: ReactNode
  onClose: () => void
  children: ReactNode
}

export function Drawer({ label, title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside
      aria-label={label}
      className="absolute inset-y-0 right-0 z-30 flex w-[min(36rem,90%)] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">{title}</div>
        <Button variant="ghost" onClick={onClose} label="Close" tooltip="Close (Esc)">
          <X size={14} />
        </Button>
      </header>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">{children}</div>
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

export function DrawerList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-0.5">{children}</ul>
}
