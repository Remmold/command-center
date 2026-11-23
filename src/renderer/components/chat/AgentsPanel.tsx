import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { ChatItem } from './types'
import { ChatItems } from './ChatItems'
import { MessageColumn } from './MessageColumn'
import { useFollowOutput } from './useFollowOutput'
import { agentDetail, agentRowMeta, atTime, flatAgents, type AgentEntry, type FlatAgent } from './agentList'
import { useTicking } from '../../hooks/useTicking'
import type { AgentHost } from './toolContext'
import { Button } from '../ui/Button'
import { DotMark, type TimelineDot } from '../ui/Timeline'
import { ListRow, ListRowLines, ListRowMeta } from '../ui/ListRow'
import { EmptyHint } from '../ui/Section'
import { overlayOpen } from '../ui/overlay'
import { useChatMediaStore } from '../../state/chatMediaStore'

const DOT: Record<AgentEntry['status'], Exclude<TimelineDot, 'none' | 'neutral'>> = { working: 'progress', finished: 'success', failed: 'error', stopped: 'error' }

interface Props {
  chatKey: string
  agents: readonly AgentEntry[]
  host: AgentHost | undefined
  cwd: string | undefined
}

/** The Agents tab: every agent of the session, or one agent's live view. */
export function AgentsPanel({ chatKey, agents, host, cwd }: Props) {
  const openKey = useChatMediaStore((s) => s.openAgent[chatKey])
  const showAgents = useChatMediaStore((s) => s.showAgents)
  const listed = useMemo(() => flatAgents(agents), [agents])
  const now = useTicking(listed.some((a) => a.status === 'working'))
  const flat = listed.map((a) => atTime(a, now))
  const open = openKey === undefined ? undefined : flat.find((a) => a.key === openKey || a.toolUseId === openKey)
  if (openKey !== undefined) return <AgentLiveView agent={open} host={host} cwd={cwd} onBack={() => showAgents(chatKey)} />
  return <AgentList agents={flat} onOpen={(key) => showAgents(chatKey, key)} />
}

function AgentList({ agents, onOpen }: { agents: readonly FlatAgent[]; onOpen: (key: string) => void }) {
  const listRef = useRef<HTMLUListElement | null>(null)
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>(':scope > li > button') ?? [])]
    if (rows.length === 0) return
    e.preventDefault()
    const at = rows.indexOf(document.activeElement as HTMLButtonElement)
    const next = at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))
    rows[next].focus()
  }
  return (
    <div role="tabpanel" aria-label="Agents" className="absolute inset-0 overflow-y-auto py-2">
      <MessageColumn>
        <ul ref={listRef} aria-label="Agents" onKeyDown={onKeyDown}>
          {agents.map((agent) => (
            <ListRow key={agent.key} nested={agent.depth > 0} onClick={() => onOpen(agent.key)} tooltip={agent.name}>
              <DotMark dot={DOT[agent.status]} />
              <ListRowLines
                primary={
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{agent.name}</span>
                    <ListRowMeta>{agentRowMeta(agent)}</ListRowMeta>
                  </>
                }
                secondary={agentDetail(agent) && <span data-agent-now="" className="min-w-0 truncate">{agentDetail(agent)}</span>}
              />
            </ListRow>
          ))}
        </ul>
      </MessageColumn>
    </div>
  )
}

/** The view's own items carry no parent call, so they draw as a chat's main flow. */
function asMainItems(items: readonly ChatItem[]): ChatItem[] {
  return items.map((item) => ((item.kind === 'assistant' || item.kind === 'tool_result') && item.parentToolUseId ? { ...item, parentToolUseId: undefined } : item))
}

interface ViewProps {
  agent: AgentEntry | undefined
  host: AgentHost | undefined
  cwd: string | undefined
  onBack: () => void
}

/** One agent's transcript, read-only, following its file as it grows; Esc or Back returns to the list. */
function AgentLiveView({ agent, host, cwd, onBack }: ViewProps) {
  const viewRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  useFollowOutput(scrollRef, contentRef)
  // The row that opened it is gone; focus here keeps Esc working.
  useEffect(() => viewRef.current?.focus({ preventScroll: true }), [])
  const items = useMemo(() => asMainItems(agent?.items ?? []), [agent?.items])
  const [stopping, setStopping] = useState(false)
  const [stopFailed, setStopFailed] = useState(false)
  const task = agent?.task
  const canStop = agent?.status === 'working' && task !== undefined && host?.stop !== undefined
  const onStop = (): void => {
    if (!task || !host?.stop) return
    setStopping(true)
    setStopFailed(false)
    void host.stop(task.taskId).then((error) => {
      setStopping(false)
      setStopFailed(error !== null)
    })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented || overlayOpen()) return
    e.preventDefault()
    onBack()
  }
  return (
    <div ref={viewRef} role="tabpanel" aria-label={agent ? `Agent ${agent.name}` : 'Agent'} data-agent-view="" tabIndex={-1} onKeyDown={onKeyDown} className="absolute inset-0 flex flex-col focus:outline-none">
      <div className="flex shrink-0 items-center gap-2 border-b border-subtle px-5 py-1">
        <Button variant="ghost" onClick={onBack} tooltip="Back to the agents (Esc)">
          <ArrowLeft size={13} strokeWidth={2} />
          Back
        </Button>
        {agent && <DotMark dot={DOT[agent.status]} />}
        <span className="flex min-w-0 flex-1 text-xs">
          <ListRowLines primary={<span className="min-w-0 truncate font-medium text-fg">{agent?.name ?? 'Agent'}</span>} secondary={agent && agentRowMeta(agent)} />
        </span>
        {canStop && (
          <Button variant="danger" disabled={stopping} onClick={onStop}>
            {stopping ? 'Stopping…' : 'Stop agent'}
          </Button>
        )}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div ref={contentRef}>
          <MessageColumn className="space-y-3">
            {stopFailed && <EmptyHint>The agent could not be stopped. It may have finished already.</EmptyHint>}
            {items.length === 0 && <EmptyHint>{agent ? 'No messages from this agent yet.' : 'This agent is not in the session any more.'}</EmptyHint>}
            <ChatItems items={items} cwd={cwd} agents={host} busy={agent?.status === 'working'} />
          </MessageColumn>
        </div>
      </div>
    </div>
  )
}
