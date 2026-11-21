import type { ReactNode } from 'react'

export function Card({ children, tooltip }: { children: ReactNode; tooltip?: string }) {
  return (
    <div title={tooltip} className="flex flex-col gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 p-2.5">
      {children}
    </div>
  )
}

export function CardMeta({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-500">{children}</div>
}

export function CardTitle({ children, prefix }: { children: ReactNode; prefix?: string }) {
  return (
    <div className="text-xs leading-snug text-zinc-100">
      {prefix && <span className="mr-1 tabular-nums text-zinc-500">{prefix}</span>}
      {children}
    </div>
  )
}
