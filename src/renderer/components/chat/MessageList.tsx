import { useRef, type ReactNode } from 'react'
import type { ChatItem } from './types'
import { ChatItems } from './ChatItems'
import { MessageColumn } from './MessageColumn'
import { useFollowOutput } from './useFollowOutput'

/** Scrolling list of chat items that follows new items while the reader is at the bottom. */
export function MessageList({ items, cwd, children }: { items: ChatItem[]; cwd: string | undefined; children?: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  useFollowOutput(scrollRef, contentRef)

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div ref={contentRef}>
        <MessageColumn className="space-y-3">
          {children}
          <ChatItems items={items} cwd={cwd} />
        </MessageColumn>
      </div>
    </div>
  )
}
