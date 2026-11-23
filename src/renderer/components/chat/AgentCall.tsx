import { useEffect, useState } from 'react'
import type { ChatItem, ToolResultItem } from './types'
import { ToolCallBody, ToolCallRow, ToolCallSection, type ToolCallStatus } from './ToolCallRow'
import { useToolContext, type AgentHost, type TranscriptSource } from './toolContext'
import { toolCallTitle } from './toolCall'
import { AGENT_STATUS_LABEL, agentMeta, agentStatus, type AgentStatus, type SubagentTask } from './subagents'
import { Message } from './Message'
import { ChatItems } from './ChatItems'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { RunInBackgroundLine } from './RunInBackgroundLine'

/** Stopped shares Failed's red dot, as the extension's `BE` draws both as failed. */
const ROW_STATUS: Record<AgentStatus, ToolCallStatus> = { working: 'running', finished: 'ok', failed: 'error', stopped: 'stopped' }

interface Props {
  id: string
  name: string
  input: unknown
  result: ToolResultItem | undefined
  resultText: string
}

function promptOf(input: unknown): string | undefined {
  const v = input && typeof input === 'object' ? (input as Record<string, unknown>).prompt : undefined
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

/** The subagent's own transcript file; undefined while reading, null when there is none. */
function useSubagentTranscript(source: TranscriptSource | undefined, callId: string, agentId: string | undefined): ChatItem[] | null | undefined {
  const [items, setItems] = useState<ChatItem[] | null | undefined>(undefined)
  const cwd = source?.cwd
  const sessionId = source?.sessionId
  useEffect(() => {
    if (!cwd || !sessionId) return
    let live = true
    void window.api.claude.subagentTranscript({ cwd, sessionId, toolUseId: callId, ...(agentId ? { agentId } : {}) }).then((found) => {
      if (live) setItems(found)
    })
    return () => {
      live = false
    }
  }, [cwd, sessionId, callId, agentId])
  return items
}

/** A subagent's live items, drawn inside the call that started or woke it. */
export function SubagentItemList({ items }: { items: ChatItem[] }) {
  return (
    <div data-subagent-items="" className="space-y-2 py-1">
      {items.map((item, i) => (
        <Message key={`${item.id}#${i}`} item={item} />
      ))}
    </div>
  )
}

/** An Agent call with its subagent's messages inside it, its status, and the extension's "Open transcript" and "Stop agent". */
export function AgentCall({ id, name, input, result, resultText }: Props) {
  const { subagentItems, agents, cwd } = useToolContext()
  const { status, task } = agentStatus(id, agents?.tasks ?? {}, result, agents?.running ?? false)
  const now = useTicking(status === 'working' && task !== undefined)
  const description = task?.description ?? toolCallTitle(name, input, cwd).target
  const meta = task ? agentMeta(task, now) : ''
  const prompt = promptOf(input)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const failure = failureText(status, task, result, resultText, description)

  return (
    <div data-agent-call={id} data-agent-status={status}>
      <ToolCallRow
        name="Agent"
        target={description}
        status={ROW_STATUS[status]}
        meta={<span className="text-[11px] text-faint">{[AGENT_STATUS_LABEL[status], meta].filter(Boolean).join(' · ')}</span>}
        foldable={{ defaultOpen: status === 'working' }}
      >
        {prompt && (
          <ToolCallBody>
            <ToolCallSection label="in" text={prompt} />
          </ToolCallBody>
        )}
        <SubagentBody callId={id} items={subagentItems.get(id) ?? []} source={agents?.transcript} agentId={task?.taskId} />
        {failure && <ErrorLine>{failure}</ErrorLine>}
        {!result && <RunInBackgroundLine toolUseId={id} />}
        <AgentActions status={status} task={task} stop={agents?.stop} onOpenTranscript={agents?.transcript ? () => setTranscriptOpen(true) : undefined} />
      </ToolCallRow>
      {transcriptOpen && agents?.transcript && (
        <TranscriptDialog title={description} status={status} task={task} source={agents.transcript} callId={id} onClose={() => setTranscriptOpen(false)} />
      )}
    </div>
  )
}

function ErrorLine({ children }: { children: string }) {
  return <div className="px-1.5 py-1 text-[12px] text-error">{children}</div>
}

/** As the extension's card: a failed agent shows its error, a stopped one its summary when that says more than the description. */
function failureText(status: AgentStatus, task: SubagentTask | undefined, result: ToolResultItem | undefined, resultText: string, description: string): string | undefined {
  if (status === 'failed') return task?.error ?? task?.summary ?? (result?.isError ? resultText : undefined)
  if (status === 'stopped' && task?.summary && task.summary !== description) return task.summary
  return undefined
}

interface BodyProps {
  callId: string
  items: ChatItem[]
  source: TranscriptSource | undefined
  agentId: string | undefined
}

/** The live subagent items; a chat without them (resumed, followed, or a background agent) reads the agent's own transcript instead. */
function SubagentBody({ callId, items, source, agentId }: BodyProps) {
  const loaded = useSubagentTranscript(items.length === 0 ? source : undefined, callId, agentId)
  if (items.length > 0) return <SubagentItemList items={items} />
  if (!loaded || loaded.length === 0) return null
  return (
    <div data-subagent-items="" className="space-y-2 py-1">
      <ChatItems items={loaded} cwd={source?.cwd} />
    </div>
  )
}

interface ActionsProps {
  status: AgentStatus
  task: SubagentTask | undefined
  stop: AgentHost['stop']
  onOpenTranscript?: () => void
}

function AgentActions({ status, task, stop, onOpenTranscript }: ActionsProps) {
  const [stopping, setStopping] = useState(false)
  const [stopFailed, setStopFailed] = useState(false)
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
      {stopFailed && <ErrorLine>The agent could not be stopped. It may have finished already.</ErrorLine>}
    </>
  )
}

interface DialogProps {
  title: string
  status: AgentStatus
  task: SubagentTask | undefined
  source: TranscriptSource
  callId: string
  onClose: () => void
}

function TranscriptDialog({ title, status, task, source, callId, onClose }: DialogProps) {
  const items = useSubagentTranscript(source, callId, task?.taskId)
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
