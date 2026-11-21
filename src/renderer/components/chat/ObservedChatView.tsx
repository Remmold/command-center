import { X } from 'lucide-react'
import { OBSERVED_INITIAL_ITEMS } from '../../../shared/types'
import { useObservedStore } from '../../state/observedStore'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { HeaderRow } from '../ui/HeaderRow'
import { EmptyHint } from '../ui/Section'
import { StatusDot } from '../ui/StatusDot'
import { Pane } from '../ui/Pane'
import { Toolbar } from '../ui/Toolbar'
import { MessageList } from './MessageList'

export function ObservedChatView() {
  const viewing = useObservedStore((s) => s.viewing)
  const session = useObservedStore((s) =>
    s.sessions.find((o) => o.workspaceId === s.viewing?.workspaceId && o.sessionId === s.viewing?.sessionId)
  )
  const items = useObservedStore((s) => s.items)
  const shortened = useObservedStore((s) => s.shortened)
  const loading = useObservedStore((s) => s.loading)
  const error = useObservedStore((s) => s.error)
  const close = useObservedStore((s) => s.close)
  if (!viewing) return null

  return (
    <Pane label="observed session">
      <Toolbar
        actions={
          <Button variant="ghost" onClick={close} label="stop following" tooltip="stop following">
            <X size={14} strokeWidth={2} />
          </Button>
        }
      >
        <HeaderRow
          icon={<StatusDot status={session?.status ?? 'quiet'} />}
          title={session?.title ?? viewing.sessionId.slice(0, 8)}
          note="read-only · reply in VS Code"
        >
          <Badge>in VS Code</Badge>
        </HeaderRow>
      </Toolbar>
      <MessageList items={items}>
        {loading && <EmptyHint>reading transcript…</EmptyHint>}
        {error && <EmptyHint>could not open this session: {error}</EmptyHint>}
        {shortened && <EmptyHint>showing the latest {OBSERVED_INITIAL_ITEMS} entries; earlier ones are in VS Code</EmptyHint>}
      </MessageList>
    </Pane>
  )
}
