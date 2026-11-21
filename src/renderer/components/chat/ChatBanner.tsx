import type { ReactNode } from 'react'

type Tone = 'info' | 'error'

const TONE: Record<Tone, string> = {
  info: 'border-subtle bg-sidebar text-muted',
  error: 'border-error bg-sidebar text-error'
}

/** A one-line notice inside the chat column with an optional action on the right. */
export function ChatBanner({ children, action, tone = 'info' }: { children: ReactNode; action?: ReactNode; tone?: Tone }) {
  return (
    <div role="status" className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs ${TONE[tone]}`}>
      <span className="min-w-0 break-words">{children}</span>
      {action}
    </div>
  )
}
