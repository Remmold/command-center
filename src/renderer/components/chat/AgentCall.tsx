import { useEffect, useState } from 'react'
import type { ChatItem, ToolResultItem } from './types'
import { ToolCallRow, ToolCallSection, ToolCallText, type ToolCallStatus } from './ToolCallRow'
import { useToolContext, type AgentHost } from './toolContext'
import { toolCallTitle } from './toolCall'
import { AGENT_STATUS_LABEL, agentMeta, agentStatus, type AgentStatus, type SubagentTask } from './subagents'
import { Message } from './Message'
import { ChatItems } from './ChatItems'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

const GLYPH: Record<AgentStatus, ToolCallStatus> = { working: 'running', finished: 'ok', failed: 'error', stopped: 'stopped' }

interface Props {
  id: string
  name: string
  input: unknown
  result: ToolResultItem | undefined
  resultText: string
}

function stringField(input: unknown, key: string): string | undefined {
  const v = input && typeof input === 'object' ? (input as Record<string, unknown>)[key] : undefined
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** Re-renders every second while `on`, for a running clock. */
function useTicking(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [on])
  return on ? now : Date.now()
}

/** An Agent call with its subagent's messages inside it, its status, and the extension's "Open transcript" and "Stop agent". */
export function AgentCall({ id, name, input, result, resultText }: Props) {
  const { subagentItems, agents, cwd } = useToolContext()
  const { status, task } = agentStatus(id, agents?.tasks ?? {}, result, agents?.running ?? false)
  const now = useTicking(status === 'working' && task !== undefined)
  const { target } = toolCallTitle(name, input, cwd)
  const description = task?.description ?? target
  const meta = task ? agentMeta(task, now) : ''
  const children = subagentItems.get(id) ?? []
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const failure = failureText(status, task, result, resultText, description)

  return (
    <div data-agent-call={id} data-agent-status={status}>
      <ToolCallRow
        name="Agent"
        target={description}
        status={GLYPH[status]}
        meta={<span className="text-[11px] text-faint">{[AGENT_STATUS_LABEL[status], meta].filter(Boolean).join(' · ')}</span>}
        defaultOpen={status === 'working'}
      >
        {stringField(input, 'prompt') && (
          <ToolCallSection label="in">
            <ToolCallText>{stringField(input, 'prompt') ?? ''}</ToolCallText>
          </ToolCallSection>
        )}
        <SubagentBody callId={id} items={children} agents={agents} />
        {failure && <div className="px-1.5 py-1 text-[12px] text-error">{failure}</div>}
        <AgentActions
          status={status}
          task={task}
          agents={agents}
          onOpenTranscript={agents?.transcript ? () => setTranscriptOpen(true) : undefined}
        />
      </ToolCallRow>
      {transcriptOpen && agents?.transcript && (
        <TranscriptDialog
          title={description}
          status={status}
          task={task}
          source={agents.transcript}
          callId={id}
          onClose={() => setTranscriptOpen(false)}
        />
      )}
    </div>
  )
}

/** As the extension's card: a failed agent shows its error, a stopped one its summary when that says more than the description. */
function failureText(status: AgentStatus, task: SubagentTask | undefined, result: ToolResultItem | undefined, resultText: string, description: string): string | undefined {
  if (status === 'failed') return task?.error ?? task?.summary ?? (result?.isError ? resultText : undefined)
  if (status === 'stopped' && task?.summary && task.summary !== description) return task.summary
  return undefined
}

/** The live subagent items; a chat without them (resumed, or a background agent) reads the agent's own transcript instead. */
function SubagentBody({ callId, items, agents }: { callId: string; items: ChatItem[]; agents: AgentHost | undefined }) {
  const source = agents?.transcript
  const loaded = useSubagentTranscript(items.length === 0 ? source : undefined, callId, agents)
  if (items.length > 0) {
    return (
      <div data-subagent-items="" className="space-y-2 py-1">
        {items.map((item, i) => (
          <Message key={`${item.id}#${i}`} item={item} />
        ))}
      </div>
    )
  }
  if (!loaded || loaded.length === 0) return null
  return (
    <div data-subagent-items="" className="space-y-2 py-1">
      <ChatItems items={loaded} cwd={source?.cwd} />
    </div>
  )
}

function useSubagentTranscript(source: AgentHost['transcript'], callId: string, agents: AgentHost | undefined): ChatItem[] | null {
  const [items, setItems] = useState<ChatItem[] | null>(null)
  const agentId = Object.values(agents?.tasks ?? {}).find((t) => t.toolUseId === callId)?.taskId
  useEffect(() => {
    if (!source) return
    let live = true
    void window.api.claude
      .subagentTranscript({ cwd: source.cwd, sessionId: source.sessionId, toolUseId: callId, ...(agentId ? { agentId } : {}) })
      .then((found) => {
        if (live) setItems(found)
      })
    return () => {
      live = false
    }
  }, [source, callId, agentId])
  return items
}

function AgentActions({ status, task, agents, onOpenTranscript }: { status: AgentStatus; task: SubagentTask | undefined; agents: AgentHost | undefined; onOpenTranscript?: () => void }) {
  const [stopping, setStopping] = useState(false)
  const [stopFailed, setStopFailed] = useState(false)
  const stop = agents?.stop
  const canStop = status === 'working' && task !== undefined && stop !== undefined
  if (!onOpenTranscript && !canStop) return null
  const onStop = (): void => {
    if (!task || !stop) return
    setStopping(true)
    setStopFailed(false)
    void stop(task.taskId).then((error) => {
      setStopping(false)
      setStopFailed(error !== null)
    })
  }
  return (
    <>
      <div className="flex gap-2 py-1">
        {onOpenTranscript && (
          <Button variant="secondary" onClick={onOpenTranscript}>
            Open transcript
          </Button>
        )}
        {canStop && (
          <Button variant="danger" disabled={stopping} onClick={onStop}>
            {stopping ? 'Stopping…' : 'Stop agent'}
          </Button>
        )}
      </div>
      {stopFailed && <div className="px-1.5 text-[12px] text-error">The agent could not be stopped. It may have finished already.</div>}
    </>
  )
}

function TranscriptDialog({ title, status, task, source, callId, onClose }: { title: string; status: AgentStatus; task: SubagentTask | undefined; source: { cwd: string; sessionId: string }; callId: string; onClose: () => void }) {
  const [items, setItems] = useState<ChatItem[] | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void window.api.claude
      .subagentTranscript({ cwd: source.cwd, sessionId: source.sessionId, toolUseId: callId, ...(task ? { agentId: task.taskId } : {}) })
      .then((found) => {
        if (live) setItems(found)
      })
    return () => {
      live = false
    }
  }, [source, callId, task])
  const meta = [AGENT_STATUS_LABEL[status], task?.subagentType, task?.isBackgrounded === undefined ? undefined : task.isBackgrounded ? 'background' : 'foreground']
    .filter(Boolean)
    .join(' · ')
  return (
    <Dialog title={title} onClose={onClose} maxWidth={1000}>
      <div className="space-y-3">
        <div className="text-[11px] text-muted">{meta}</div>
        {items === undefined && <div className="text-faint">reading transcript…</div>}
        {items === null && <div className="text-faint">No transcript for this agent yet.</div>}
        {items && <ChatItems items={items} cwd={source.cwd} />}
      </div>
    </Dialog>
  )
}
