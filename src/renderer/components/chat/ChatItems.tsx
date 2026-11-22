import { Fragment, useMemo } from 'react'
import type { AssistantMessageItem, ChatItem } from './types'
import { Message } from './Message'
import { pairToolResults } from './toolCall'
import { ToolContext, type AgentHost } from './toolContext'
import { groupSubagents, parentOf } from './subagents'
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
  agents?: AgentHost
}

/** The time a message shows a stamp for, as the extension's `m4`: a typed prompt or a settled reply with text. */
function stampTime(item: ChatItem, streamingId: string | undefined): number | undefined {
  if (item.at === undefined || parentOf(item) !== undefined) return undefined
  if (item.kind === 'user') return item.at
  if (item.kind !== 'assistant' || item.id === streamingId) return undefined
  return item.content.some((b) => b.type === 'text') ? item.at : undefined
}

/** Chat items with each tool result folded into the row of the call it answers, subagent items under their Agent call, and a date line where the day changes. */
export function ChatItems({ items, cwd, streaming = null, thinkingTokens, agents }: Props) {
  const view = useMemo(() => withStreaming(items, streaming), [items, streaming])
  const pairs = useMemo(() => pairToolResults(view.items), [view.items])
  const groups = useMemo(() => groupSubagents(view.items), [view.items])
  const latestTodoId = useMemo(() => latestTodoCallId(groups.main, pairs), [groups, pairs])
  const context = useMemo(
    () => ({ pairs, cwd, latestTodoId, subagentItems: groups.byCall, agents }),
    [pairs, cwd, latestTodoId, groups, agents]
  )
  const stamps = useMemo(() => groups.main.map((item) => stampTime(item, view.live?.id)), [groups, view.live])
  const days = useMemo(() => dayBreaks(stamps), [stamps])
  const now = Date.now()
  // Chats saved before blocks were merged can hold several items with one message id.
  const seen = new Set<string>()
  return (
    <ToolContext.Provider value={context}>
      {groups.main.map((item, i) => {
        const live = view.live?.id === item.id && item.kind === 'assistant'
        const day = days[i]
        const key = seen.has(item.id) ? `${item.id}#${i}` : item.id
        seen.add(item.id)
        return (
          <Fragment key={key}>
            {day !== undefined && <LabeledDivider>{dayLabel(day, now)}</LabeledDivider>}
            <div className="lazy-render">
              <Message
                item={item}
                stampAt={stamps[i]}
                streamingFrom={live ? view.live?.from : undefined}
                thinkingTokens={live ? thinkingTokens : undefined}
              />
            </div>
          </Fragment>
        )
      })}
    </ToolContext.Provider>
  )
}
