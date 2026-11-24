import { useState } from 'react'
import type { ToolResultItem } from './types'
import { ToolCallBody, ToolCallRow, ToolCallSection, type ToolCallStatus } from './ToolCallRow'
import { useToolContext } from './toolContext'
import { taskForCall, type AgentStatus, type SubagentTask } from './subagents'
import { agentDetail, agentEntry, agentRowMeta } from './agentList'
import { useTicking } from '../../hooks/useTicking'
import { RunInBackgroundLine } from './RunInBackgroundLine'
import { SecondaryLine } from '../ui/SecondaryLine'
import { DisclosureSummary } from '../ui/DisclosureSummary'
import { useChatMediaStore } from '../../state/chatMediaStore'
import { tailOf, useSubagentTailsStore } from '../../state/subagentTailsStore'
import { subagentSourceKey } from '../../../shared/subagentTail'

/** Stopped shares Failed's red dot, as the extension's `BE` draws both as failed; Ended has no result to show. */
const AGENT_ROW_STATUS: Record<AgentStatus, ToolCallStatus> = { working: 'running', finished: 'ok', failed: 'error', stopped: 'stopped', ended: 'pending' }

interface Props {
  id: string
  name: string
  input: unknown
  result: ToolResultItem | undefined
  resultText: string
}

/** An Agent call as one compact row: its name, live "now" line, time, tool count and status. Its messages live in the Agents tab, which a click opens. */
export function AgentCall({ id, input, result, resultText }: Props) {
  const { subagentItems, agents, cwd } = useToolContext()
  const task = taskForCall(agents?.tasks ?? {}, id)
  const source = agents?.transcript
  const sourceKey = source ? subagentSourceKey(source) : undefined
  const tail = useSubagentTailsStore((s) => (sourceKey ? tailOf(s.byKey[sourceKey], task?.taskId, id) : undefined))
  const entry = agentEntry({ toolUseId: id, input, result, task, tail, streamItems: subagentItems.get(id), running: agents?.running ?? false, cwd, now: Date.now() })
  // Each tick re-renders, and the entry above reads the clock again.
  useTicking(entry.status === 'working' && entry.startTime !== undefined)
  const [taskOpen, setTaskOpen] = useState(false)
  const showAgents = useChatMediaStore((s) => s.showAgents)
  const chatKey = agents?.chatKey
  const failure = failureText(entry.status, task, result, resultText, entry.name)
  const detail = agentDetail(entry)

  return (
    <div data-agent-call={id} data-agent-status={entry.status}>
      <ToolCallRow
        name="Agent"
        target={entry.name}
        status={AGENT_ROW_STATUS[entry.status]}
        meta={<span className="text-[11px] text-faint">{agentRowMeta(entry)}</span>}
        onOpen={chatKey ? () => showAgents(chatKey, entry.key) : undefined}
        defaultOpen
      >
        {detail && (
          <SecondaryLine>
            <span data-agent-now="" className="min-w-0 truncate">
              {detail}
            </span>
          </SecondaryLine>
        )}
        {failure && <div className="px-1.5 py-1 text-[12px] text-error">{failure}</div>}
        {entry.prompt && (
          <>
            <DisclosureSummary open={taskOpen} onToggle={() => setTaskOpen((o) => !o)}>
              task
            </DisclosureSummary>
            {taskOpen && (
              <ToolCallBody>
                <ToolCallSection label="in" text={entry.prompt} />
              </ToolCallBody>
            )}
          </>
        )}
        {!result && <RunInBackgroundLine toolUseId={id} />}
      </ToolCallRow>
    </div>
  )
}

/** As the extension's card: a failed agent shows its error, a stopped one its summary when that says more than its name. */
function failureText(status: AgentStatus, task: SubagentTask | undefined, result: ToolResultItem | undefined, resultText: string, name: string): string | undefined {
  if (status === 'failed') return task?.error ?? task?.summary ?? (result?.isError ? resultText : undefined)
  if (status === 'stopped' && task?.summary && task.summary !== name) return task.summary
  return undefined
}
