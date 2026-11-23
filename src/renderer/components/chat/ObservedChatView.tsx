import { useMemo } from 'react'
import { OBSERVED_INITIAL_ITEMS } from '../../../shared/types'
import { useObservedStore } from '../../state/observedStore'
import { mediaKeyOf } from '../../state/chatMediaStore'
import { EmptyHint } from '../ui/Section'
import { Pane } from '../ui/Pane'
import { ObservedMediaTabs } from './MediaTabs'
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
  // VS Code's CLI keeps each subagent's messages in its own file, which the Agents tab follows.
  const agents = useMemo(
    (): AgentHost => ({
      tasks: {},
      running: live,
      ...(sessionId ? { chatKey: mediaKeyOf({ kind: 'observed', sessionId }) } : {}),
      ...(cwd && sessionId ? { transcript: { cwd, sessionId } } : {})
    }),
    [live, cwd, sessionId]
  )
  if (!viewing) return null

  return (
    <Pane label="observed session">
      <ObservedMediaTabs sessionId={viewing.sessionId} cwd={cwd} agents={agents}>
        <MessageList items={items} cwd={cwd} agents={agents} busy={live}>
          {loading && <EmptyHint>reading transcript…</EmptyHint>}
          {error && <EmptyHint>could not open this session: {error}</EmptyHint>}
          {shortened && <EmptyHint>showing the latest {OBSERVED_INITIAL_ITEMS} entries; earlier ones are in VS Code</EmptyHint>}
        </MessageList>
      </ObservedMediaTabs>
    </Pane>
  )
}
