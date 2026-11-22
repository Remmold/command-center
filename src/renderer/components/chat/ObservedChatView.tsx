import { OBSERVED_INITIAL_ITEMS } from '../../../shared/types'
import { useObservedStore } from '../../state/observedStore'
import { EmptyHint } from '../ui/Section'
import { Pane } from '../ui/Pane'
import { useMemo } from 'react'
import { MessageList } from './MessageList'
import type { AgentHost } from './toolContext'

/** The read-only transcript of the observed session being followed. */
export function ObservedChatView({ cwd }: { cwd: string | undefined }) {
  const viewing = useObservedStore((s) => s.viewing)
  const items = useObservedStore((s) => s.items)
  const shortened = useObservedStore((s) => s.shortened)
  const loading = useObservedStore((s) => s.loading)
  const error = useObservedStore((s) => s.error)
  const live = useObservedStore((s) => s.sessions.some((o) => o.sessionId === s.viewing?.sessionId && o.status === 'live'))
  const sessionId = viewing?.sessionId
  // VS Code's CLI keeps a subagent's messages in their own file; an Agent call reads them from there.
  const agents = useMemo(
    (): AgentHost => ({ tasks: {}, running: live, ...(cwd && sessionId ? { transcript: { cwd, sessionId } } : {}) }),
    [live, cwd, sessionId]
  )
  if (!viewing) return null

  return (
    <Pane label="observed session">
      <MessageList items={items} cwd={cwd} agents={agents}>
        {loading && <EmptyHint>reading transcript…</EmptyHint>}
        {error && <EmptyHint>could not open this session: {error}</EmptyHint>}
        {shortened && <EmptyHint>showing the latest {OBSERVED_INITIAL_ITEMS} entries; earlier ones are in VS Code</EmptyHint>}
      </MessageList>
    </Pane>
  )
}
