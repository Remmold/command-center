import { useMemo } from 'react'
import type { ChatItem } from './types'
import { Message } from './Message'
import { pairToolResults } from './toolCall'
import { ToolContext } from './toolContext'

interface Props {
  items: ChatItem[]
  cwd: string | undefined
  /** The assistant message still streaming, drawn after the committed items. */
  streaming?: ChatItem | null
}

/** Chat items with each tool result folded into the row of the call it answers. */
export function ChatItems({ items, cwd, streaming }: Props) {
  const pairs = useMemo(() => pairToolResults(streaming ? [...items, streaming] : items), [items, streaming])
  const context = useMemo(() => ({ pairs, cwd }), [pairs, cwd])
  return (
    <ToolContext.Provider value={context}>
      {items.map((item) => (
        <Message key={item.id} item={item} />
      ))}
      {streaming && <Message item={streaming} />}
    </ToolContext.Provider>
  )
}
