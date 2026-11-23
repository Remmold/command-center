import { Fragment, useMemo, useRef } from 'react'
import type { AssistantMessageItem, ChatItem } from './types'
import { Message } from './Message'
import { pairToolResults } from './toolCall'
import { ToolContext, type AgentHost, type BackgroundHost } from './toolContext'
import { runningCalls } from './runningCalls'
import { groupSubagents, parentOf } from './subagents'
import { latestTodoCallId } from './todos'
import { withStreaming } from './liveItems'
import { dayBreaks, dayLabel } from './messageTime'
import { pairCompactions } from './compaction'
import { rowKind, timelineJoins, type RowKind } from './timelineRows'
import { FileOpenerProvider } from './fileOpener'
import { LabeledDivider } from '../ui/LabeledDivider'

interface Props {
  items: ChatItem[]
  cwd: string | undefined
  /** The assistant message still streaming, drawn in place of or after its committed part. */
  streaming?: AssistantMessageItem | null
  thinkingTokens?: number
  agents?: AgentHost
  /** True while the turn runs: calls without a result are then running. */
  busy?: boolean
  background?: BackgroundHost
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

/** The running calls, kept as the same set while they stay the same, so streaming text does not redraw every tool row. */
function useRunningCalls(items: ChatItem[], busy: boolean): ReadonlySet<string> {
  const last = useRef<ReadonlySet<string>>(new Set())
  return useMemo(() => {
    const next = runningCalls(items, busy)
    if (!sameSet(next, last.current)) last.current = next
    return last.current
  }, [items, busy])
}

/** The time a message shows a stamp for, as the extension's `m4`: a typed prompt or a settled reply with text. */
function stampTime(item: ChatItem, streamingId: string | undefined): number | undefined {
  if (item.at === undefined || parentOf(item) !== undefined) return undefined
  if (item.kind === 'user') return item.at
  if (item.kind !== 'assistant' || item.id === streamingId) return undefined
  return item.content.some((b) => b.type === 'text') ? item.at : undefined
}

/** Chat items with each tool result folded into the row of the call it answers, subagent items under their Agent call, and a date line where the day changes. */
export function ChatItems({ items, cwd, streaming = null, thinkingTokens, agents, busy = false, background }: Props) {
  const view = useMemo(() => withStreaming(items, streaming), [items, streaming])
  const pairs = useMemo(() => pairToolResults(view.items), [view.items])
  const groups = useMemo(() => groupSubagents(view.items), [view.items])
  const compactions = useMemo(() => pairCompactions(groups.main), [groups])
  const kinds = useMemo(() => groups.main.map((item) => rowKind(item, pairs, compactions)), [groups, pairs, compactions])
  const joins = useMemo(() => timelineJoins(kinds), [kinds])
  const latestTodoId = useMemo(() => latestTodoCallId(groups.main, pairs), [groups, pairs])
  const running = useRunningCalls(view.items, busy)
  const context = useMemo(
    () => ({ pairs, cwd, latestTodoId, subagentItems: groups.byCall, agents, running, background }),
    [pairs, cwd, latestTodoId, groups, agents, running, background]
  )
  const stamps = useMemo(() => groups.main.map((item) => stampTime(item, view.live?.id)), [groups, view.live])
  const days = useMemo(() => dayBreaks(stamps), [stamps])
  const now = Date.now()
  // Chats saved before blocks were merged can hold several items with one message id.
  const seen = new Set<string>()
  return (
    <FileOpenerProvider cwd={cwd}>
      <ToolContext.Provider value={context}>
        <div data-chat-items="">
          {groups.main.map((item, i) => {
            if (kinds[i] === 'hidden') return null
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
                    joinAbove={joins[i].above && day === undefined}
                    joinBelow={joins[i].below && days[nextDrawn(kinds, i)] === undefined}
                    compactSummary={compactions.summaryFor.get(item.id)}
                  />
                </div>
              </Fragment>
            )
          })}
        </div>
      </ToolContext.Provider>
    </FileOpenerProvider>
  )
}

function nextDrawn(kinds: readonly RowKind[], i: number): number {
  for (let j = i + 1; j < kinds.length; j++) if (kinds[j] !== 'hidden') return j
  return -1
}
