import type { ReactNode } from 'react'

interface Props {
  title: string
  count: number
  children: ReactNode
}

export function Column({ title, count, children }: Props) {
  return (
    <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg bg-zinc-900/40">
      <header className="flex shrink-0 items-center justify-between px-3 py-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{title}</h2>
        <span className="text-[10px] tabular-nums text-zinc-500">{count}</span>
      </header>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">{children}</div>
    </section>
  )
}

export function ColumnRow({ children }: { children: ReactNode }) {
  return <div className="flex h-full gap-2 bg-zinc-950 p-2">{children}</div>
}
