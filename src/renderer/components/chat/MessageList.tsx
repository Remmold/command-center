import { useEffect, useRef, type ReactNode } from 'react'
import type { ChatItem } from './types'
import { Message } from './Message'

const STICK_PX = 48

/** Scrolling list of chat items that follows new items while the reader is at the bottom. */
export function MessageList({ items, children }: { items: ChatItem[]; children?: ReactNode }) {
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
      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
    >
      {children}
      {items.map((item) => (
        <Message key={item.id} item={item} />
      ))}
    </div>
  )
}
