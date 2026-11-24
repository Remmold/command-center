import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { SubagentSource } from '../../../shared/subagentTail'
import { useAgentTails } from '../../state/subagentTailsStore'
import { useTicking } from '../../hooks/useTicking'
import type { SubagentTasks } from './subagents'
import { useSubagentTasksStore } from '../../state/subagentTasksStore'
import { useChatMediaStore } from '../../state/chatMediaStore'
import { AGENT_RECHECK_MS, agentsStillWorking } from './agentList'
import { MessageColumn } from './MessageColumn'
import { STATIC_GLYPH } from './workingSpinner'
import { SecondaryLine } from '../ui/SecondaryLine'

const DONE_NOTE_MS = 4000
const NO_TASKS: SubagentTasks = {}

interface Props {
  paneId: string
  turnActive: boolean
  /** Where the chat's agents' own files are, whose ends count too. */
  transcript: SubagentSource | undefined
}

/**
 * Pinned under the transcript once the turn has ended while agents still work, so the chat does not look finished:
 * "✻ 2 agents still working · View". A short "agents done" note follows the last one.
 */
export const AgentsStillWorking = memo(function AgentsStillWorking({ paneId, turnActive, transcript }: Props) {
  const tasks = useSubagentTasksStore((s) => s.byPane[paneId] ?? NO_TASKS)
  // The Agents tab follows the files; this only reads what it has.
  const tails = useAgentTails(transcript, false)
  const anyTask = useMemo(() => Object.values(tasks).some((t) => t.status === 'working'), [tasks])
  const tick = useTicking(anyTask && !turnActive, AGENT_RECHECK_MS)
  const clock = anyTask ? tick : 0
  const count = useMemo(() => agentsStillWorking(tasks, tails, turnActive, Date.now()), [tasks, tails, turnActive, clock])
  const showAgents = useChatMediaStore((s) => s.showAgents)
  const [done, setDone] = useState(false)
  const before = useRef(0)
  useEffect(() => {
    const was = before.current
    before.current = count
    if (count > 0) setDone(false)
    if (was === 0 || count > 0 || turnActive) return
    setDone(true)
    const timer = setTimeout(() => setDone(false), DONE_NOTE_MS)
    return () => clearTimeout(timer)
  }, [count, turnActive])

  if (count === 0 && !done) return null
  return (
    <div className="shrink-0 px-5">
      <MessageColumn>
        {count > 0 ? (
          <div data-agents-still-working="" role="status" className="flex h-[1.85em] items-center gap-1 text-[13px] text-fg">
            <span aria-hidden className="inline-block w-[1.5em] text-center font-mono text-[16px] text-spinner">
              {STATIC_GLYPH}
            </span>
            <span className="font-medium">
              {count} {count === 1 ? 'agent' : 'agents'} still working
            </span>
            <span className="text-muted">·</span>
            <button type="button" onClick={() => showAgents(paneId)} className="text-link hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus">
              View
            </button>
          </div>
        ) : (
          <div data-agents-done="" role="status">
            <SecondaryLine>agents done</SecondaryLine>
          </div>
        )}
      </MessageColumn>
    </div>
  )
})
