import { memo, useEffect, useRef, useState } from 'react'
import { useSubagentTasksStore } from '../../state/subagentTasksStore'
import { useChatMediaStore } from '../../state/chatMediaStore'
import { agentsStillWorking } from './agentList'
import { MessageColumn } from './MessageColumn'
import { STATIC_GLYPH } from './workingSpinner'
import { SecondaryLine } from '../ui/SecondaryLine'

const DONE_NOTE_MS = 4000

/**
 * Pinned under the transcript once the turn has ended while agents still work, so the chat does not look finished:
 * "✻ 2 agents still working · View". A short "agents done" note follows the last one.
 */
export const AgentsStillWorking = memo(function AgentsStillWorking({ paneId, turnActive }: { paneId: string; turnActive: boolean }) {
  const count = useSubagentTasksStore((s) => agentsStillWorking(s.byPane[paneId] ?? {}, turnActive))
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
