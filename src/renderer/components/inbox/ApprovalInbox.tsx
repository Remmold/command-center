import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ApprovalRequest } from '../../../shared/approval'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { APPROVALS_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { approvalKind, currentTodo, lastAssistantText } from '../../state/approvalContext'
import type { InboxRow } from '../../state/approvalInbox'
import { useApprovalInboxStore } from '../../state/approvalInboxStore'
import { useApprovalsStore } from '../../state/approvalsStore'
import { accountOf } from '../../state/accounts'
import { useChatItemsStore } from '../../state/chatItemsStore'
import { elapsed } from '../../state/nowBuilding'
import type { PermissionMode } from '../../state/permissionModes'
import { findSessionByPane, useProjectViewsStore } from '../../state/projectViewsStore'
import { openSession } from '../../state/sessionNavigation'
import { useAccounts } from '../../state/useAccounts'
import { useModelChoice } from '../../state/useModelChoice'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { switchSessionMode } from '../../state/sessionMode'
import { ApprovalPrompt } from '../chat/ApprovalPrompt'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Clamp } from '../ui/Clamp'
import { Dialog } from '../ui/Dialog'
import { focusFirstAnswer } from '../ui/ChoicePrompt'
import { ListRow, ListRowLines, ListRowMeta, ListRowText } from '../ui/ListRow'
import { Markdown } from '../ui/Markdown'
import { NoticeLine } from '../ui/NoticeLine'
import { isTyping } from '../ui/overlay'
import { ScrollStack } from '../ui/ScrollStack'
import { DetailRow } from '../ui/DetailRow'
import { SidebarLayout } from '../ui/SidebarLayout'

const CONTEXT_LINES = 6

interface ChatInfo {
  paneId: string
  title: string
  workspaceId: string
  repoGroupKey: string
  repoName: string
  account: string | null
  model?: string
  effort?: string
  profileId?: string
}

/** What each chat with a request is called and where it lives, from the stores the Work list reads. */
function useChats(paneIds: readonly string[]): Record<string, ChatInfo> {
  const views = useProjectViewsStore((s) => s.views)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const accounts = useAccounts()
  const key = paneIds.join('|')
  return useMemo(() => {
    const out: Record<string, ChatInfo> = {}
    for (const paneId of key ? key.split('|') : []) {
      const found = findSessionByPane(useProjectViewsStore.getState(), paneId)
      if (!found) continue
      const workspace = workspaces.find((w) => w.id === found.projectId)
      out[paneId] = {
        paneId,
        title: found.session.title,
        workspaceId: found.projectId,
        repoGroupKey: workspace?.repoGroupKey ?? found.projectId,
        repoName: workspace?.repoName ?? found.projectId,
        account: accounts.length > 1 && workspace ? accountOf(accounts, workspace.profileId).name : null,
        model: found.session.model,
        effort: found.session.effort,
        profileId: workspace?.profileId
      }
    }
    return out
  }, [key, views, workspaces, accounts])
}


/** Ctrl+Shift+A: every waiting approval, question and plan of the hosted chats in one queue, answered with the chat's own prompt. */
export function ApprovalInbox() {
  const open = useApprovalInboxStore((s) => s.open)
  return open ? <InboxDialog /> : null
}

function InboxDialog() {
  const queue = useApprovalInboxStore((s) => s.queue)
  const byPane = useApprovalsStore((s) => s.byPane)
  const close = useApprovalInboxStore((s) => s.close)
  const requests = useMemo(() => new Map(Object.values(byPane).flat().map((r) => [r.requestId, r])), [byPane])
  // A row answered elsewhere keeps the request it showed, so it can still say what it was.
  const seen = useRef(new Map<string, ApprovalRequest>())
  for (const [id, r] of requests) seen.current.set(id, r)
  const chats = useChats(queue.rows.map((r) => r.paneId))
  const now = useMinuteClock()
  const selected = queue.rows.find((r) => r.requestId === queue.selected) ?? null
  const mainRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    focusFirstAnswer(mainRef.current?.querySelector('[data-choice-prompt]') ?? null)
  }, [queue.selected])

  const jump = (paneId: string): void => {
    close()
    openSession(paneId)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
    const inList = listRef.current?.contains(e.target as Node) ?? false
    const key = e.key.toLowerCase()
    const step = key === 'j' || (inList && e.key === 'ArrowDown') ? 1 : key === 'k' || (inList && e.key === 'ArrowUp') ? -1 : 0
    if (step !== 0) {
      e.preventDefault()
      e.stopPropagation()
      useApprovalInboxStore.getState().move(step)
      return
    }
    if (key === 'o' && selected) {
      e.preventDefault()
      e.stopPropagation()
      jump(selected.paneId)
    }
  }

  const title = `Approvals (${APPROVALS_SHORTCUT})`
  return (
    <Dialog title={title} onClose={close} maxWidth={1100} size="tall" marker="approval-inbox">
      <div className="flex min-h-0 min-w-0 flex-1" onKeyDownCapture={onKeyDown}>
        <SidebarLayout
          sidebar={
            <ul ref={listRef} aria-label="Waiting approvals" className="py-1">
              {queue.rows.map((row) => (
                <QueueRow key={row.requestId} row={row} request={seen.current.get(row.requestId)} chat={chats[row.paneId]} now={now} active={row.requestId === queue.selected} />
              ))}
            </ul>
          }
        >
          <div ref={mainRef} className="flex h-full min-h-0 flex-col">
            {selected && <SelectedItem key={selected.requestId} row={selected} request={seen.current.get(selected.requestId)} chat={chats[selected.paneId]} onJump={jump} />}
          </div>
        </SidebarLayout>
      </div>
    </Dialog>
  )
}

function QueueRow({ row, request, chat, now, active }: { row: InboxRow; request: ApprovalRequest | undefined; chat: ChatInfo | undefined; now: number; active: boolean }) {
  const kind = request ? approvalKind(request.toolName) : ''
  const waited = elapsed(row.raisedAt, now)
  const title = chat?.title ?? 'Chat'
  return (
    <ListRow active={active} onClick={() => useApprovalInboxStore.getState().select(row.requestId)} tooltip={`${title} · ${kind}`}>
      {chat && <RepoIcon repoGroupKey={chat.repoGroupKey} repoName={chat.repoName} size="sm" />}
      <ListRowLines
        primary={<ListRowText primary={title} />}
        secondary={
          <>
            <ListRowText primary={row.goneAt !== undefined ? 'answered in chat' : kind} />
            {chat?.account && <Badge>{chat.account}</Badge>}
          </>
        }
      />
      <ListRowMeta>{waited ?? 'now'}</ListRowMeta>
    </ListRow>
  )
}

function SelectedItem({ row, request, chat, onJump }: { row: InboxRow; request: ApprovalRequest | undefined; chat: ChatInfo | undefined; onJump: (paneId: string) => void }) {
  const items = useChatItemsStore((s) => s.items[row.paneId])
  const said = useMemo(() => (items ? lastAssistantText(items) : null), [items])
  const todo = useMemo(() => (items ? currentTodo(items) : null), [items])
  const choice = useModelChoice(row.paneId, { model: chat?.model, effort: chat?.effort }, chat?.profileId)
  const autoAvailable = choice.entry?.supportsAutoMode === true

  const setMode = async (mode: PermissionMode): Promise<boolean> =>
    (await switchSessionMode(row.paneId, mode, (fields) => window.api.claude.control(row.paneId, 'set_permission_mode', fields))) === null

  return (
    <>
      <NoticeLine strip action={<Button variant="secondary" onClick={() => onJump(row.paneId)} tooltip="Open the chat at this request (O)"><ExternalLink size={12} /> Open chat</Button>}>
        {chat ? `${chat.repoName} · ${chat.title}` : 'Chat'}
      </NoticeLine>
      <ScrollStack>
        <div className="flex flex-col gap-3 py-3">
          {(said || todo) && (
            <section aria-label="Context" className="flex flex-col gap-1.5">
              {said && (
                <Clamp lines={CONTEXT_LINES}>
                  <Markdown text={said} tone="muted" />
                </Clamp>
              )}
              {todo && <DetailRow label="Current task" value={todo} />}
            </section>
          )}
          {row.goneAt !== undefined || !request ? (
            <NoticeLine>Answered in chat</NoticeLine>
          ) : (
            <ApprovalPrompt request={request} autoAvailable={autoAvailable} onSetMode={setMode} onAnswered={useApprovalInboxStore.getState().answered} escapeCloses />
          )}
        </div>
      </ScrollStack>
    </>
  )
}
