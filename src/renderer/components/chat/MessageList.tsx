import { useEffect, useRef, type ReactNode } from 'react'
import type { ChatItem } from './types'
import { ChatItems } from './ChatItems'
import { MessageColumn } from './MessageColumn'

const STICK_PX = 48

/** Scrolling list of chat items that follows new items while the reader is at the bottom. */
export function MessageList({ items, cwd, children }: { items: ChatItem[]; cwd: string | undefined; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const atBottom = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [items])

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX
      }}
      className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
    >
      <MessageColumn className="space-y-3">
        {children}
        <ChatItems items={items} cwd={cwd} />
      </MessageColumn>
    </div>
  )
}
