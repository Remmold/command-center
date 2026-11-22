import { Fragment, useMemo } from 'react'
import type { AssistantMessageItem, ChatItem } from './types'
import { Message } from './Message'
import { pairToolResults } from './toolCall'
import { ToolContext } from './toolContext'
import { latestTodoCallId } from './todos'
import { withStreaming } from './liveItems'
import { dayBreaks, dayLabel } from './messageTime'
import { LabeledDivider } from '../ui/LabeledDivider'

interface Props {
  items: ChatItem[]
  cwd: string | undefined
  /** The assistant message still streaming, drawn in place of or after its committed part. */
  streaming?: AssistantMessageItem | null
  thinkingTokens?: number
}

/** The time a message shows a stamp for, as the extension's `m4`: a typed prompt or a settled reply with text. */
function stampTime(item: ChatItem, streamingId: string | undefined): number | undefined {
  if (item.at === undefined) return undefined
  if (item.kind === 'user') return item.at
  if (item.kind !== 'assistant' || item.id === streamingId) return undefined
  return item.content.some((b) => b.type === 'text') ? item.at : undefined
}

/** Chat items with each tool result folded into the row of the call it answers, and a date line where the day changes. */
export function ChatItems({ items, cwd, streaming = null, thinkingTokens }: Props) {
  const view = useMemo(() => withStreaming(items, streaming), [items, streaming])
  const pairs = useMemo(() => pairToolResults(view.items), [view.items])
  const latestTodoId = useMemo(() => latestTodoCallId(view.items, pairs), [view.items, pairs])
  const context = useMemo(() => ({ pairs, cwd, latestTodoId }), [pairs, cwd, latestTodoId])
  const days = useMemo(() => dayBreaks(view.items.map((item) => stampTime(item, view.live?.id))), [view])
  const now = Date.now()
  // Chats saved before blocks were merged can hold several items with one message id.
  const seen = new Set<string>()
  return (
    <ToolContext.Provider value={context}>
      {view.items.map((item, i) => {
        const live = view.live?.id === item.id && item.kind === 'assistant'
        const day = days[i]
        const key = seen.has(item.id) ? `${item.id}#${i}` : item.id
        seen.add(item.id)
        return (
          <Fragment key={key}>
            {day !== undefined && <LabeledDivider>{dayLabel(day, now)}</LabeledDivider>}
            <Message item={item} streamingFrom={live ? view.live?.from : undefined} thinkingTokens={live ? thinkingTokens : undefined} />
          </Fragment>
        )
      })}
    </ToolContext.Provider>
  )
}
