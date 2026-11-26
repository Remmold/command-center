import { useMemo } from 'react'
import { Check, CheckCheck } from 'lucide-react'
import { allowReply } from '../../../shared/approval'
import { APPROVALS_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useApprovalInboxStore } from '../../state/approvalInboxStore'
import { answerRequest, useApprovalsStore } from '../../state/approvalsStore'
import { acceptAllIds, approvalLines, type ApprovalLine } from '../../state/dashboardApprovals'
import { elapsed } from '../../state/nowBuilding'
import { useChats, type ChatInfo } from '../inbox/ApprovalInbox'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { ListRow, ListRowLines, ListRowMeta, ListRowText } from '../ui/ListRow'
import { Panel } from '../ui/Panel'

/** Yes, this once: the reply the chat's own "1 Yes" sends. */
function accept(line: ApprovalLine): void {
  answerRequest(line.request.requestId, allowReply(line.request.input))
}

function openInInbox(line: ApprovalLine): void {
  const inbox = useApprovalInboxStore.getState()
  inbox.show(line.request.paneId)
  inbox.select(line.request.requestId)
}

/** Every request the hosted chats wait on, always on the Dashboard, with Yes per tool approval and Accept all. */
export function ApprovalsPanel({ now }: { now: number }) {
  const byPane = useApprovalsStore((s) => s.byPane)
  const paneIds = useMemo(() => Object.keys(byPane).filter((p) => byPane[p].length > 0), [byPane])
  const chats = useChats(paneIds)
  const lines = useMemo(() => approvalLines(byPane, (paneId) => chats[paneId]?.cwd), [byPane, chats])
  const bulk = acceptAllIds(lines)

  const acceptAll = (): void => {
    const still = new Set(Object.values(useApprovalsStore.getState().byPane).flat().map((r) => r.requestId))
    for (const line of lines) if (bulk.includes(line.request.requestId) && still.has(line.request.requestId)) accept(line)
  }

  const actions = (
    <Button variant="secondary" onClick={acceptAll} disabled={bulk.length === 0} tooltip="Yes, this once, to every tool approval listed here. Questions and plans stay.">
      <CheckCheck size={12} strokeWidth={2} /> Accept all{bulk.length > 0 ? ` (${bulk.length})` : ''}
    </Button>
  )

  return (
    <Panel title="Approvals" count={lines.length} empty="No session is waiting for a permission" boxed actions={actions}>
      <ul aria-label="Waiting approvals">
        {lines.map((line) => (
          <ApprovalRow key={line.request.requestId} line={line} chat={chats[line.request.paneId]} now={now} />
        ))}
      </ul>
    </Panel>
  )
}

function ApprovalRow({ line, chat, now }: { line: ApprovalLine; chat: ChatInfo | undefined; now: number }) {
  const title = chat?.title ?? 'Chat'
  const yes = line.bulk ? (
    <IconButton label="Yes" tooltip="Yes, this once" onClick={() => accept(line)}>
      <Check size={14} strokeWidth={2} />
    </IconButton>
  ) : undefined
  return (
    <ListRow
      onClick={() => openInInbox(line)}
      tooltip={`${title} · ${line.kind}${line.target ? `\n${line.target}` : ''}\nOpen in approvals (${APPROVALS_SHORTCUT})`}
      actions={yes}
      edge="waiting"
    >
      {chat && <RepoIcon repoGroupKey={chat.repoGroupKey} repoName={chat.repoName} size="sm" />}
      <ListRowLines
        primary={
          <>
            <ListRowText primary={title} secondary={chat?.repoName} />
            {chat?.account && <Badge>{chat.account}</Badge>}
          </>
        }
        secondary={
          <>
            <Badge tone={line.bulk ? 'neutral' : 'waiting'}>{line.kind}</Badge>
            {line.target && <ListRowText primary={line.target} />}
          </>
        }
      />
      <ListRowMeta>{elapsed(line.request.raisedAt, now) ?? 'now'}</ListRowMeta>
    </ListRow>
  )
}
