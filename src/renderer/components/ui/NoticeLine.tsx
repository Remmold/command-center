import type { ReactNode } from 'react'

const TONES = { muted: 'text-muted', warning: 'text-warning' } as const

/** One slim line of information with an optional trailing action. */
interface Props {
  children: ReactNode
  action?: ReactNode
  tone?: keyof typeof TONES
  /** A full-width strip under a pane's header, ruled off below. */
  strip?: boolean
}

export function NoticeLine({ children, action, tone = 'muted', strip = false }: Props) {
  return (
    <div role="status" className={`flex shrink-0 items-center gap-2 px-3 text-[11px] ${TONES[tone]} ${strip ? 'h-8 border-b border-b-subtle' : ''}`}>
      <span className="min-w-0 truncate">{children}</span>
      {action}
    </div>
  )
}
