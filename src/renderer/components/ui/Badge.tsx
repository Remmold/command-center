import type { ReactNode } from 'react'

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-zinc-800 px-1.5 py-px text-[10px] leading-4 text-zinc-400">{children}</span>
  )
}
