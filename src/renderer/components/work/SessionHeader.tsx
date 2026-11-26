import { useMenu } from '../../hooks/useMenu'
import {
  Columns2,
  Copy,
  Download,
  History,
  Loader2,
  MessageCirclePlus,
  MoreHorizontal,
  PanelLeft,
  PieChart,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import type { ObservedSession, Workspace } from '../../../shared/types'
import { useChatItemsStore } from '../../state/chatItemsStore'
import {
  useProjectViewsStore,
  type ClaudeChatSession,
  type ClaudeModel,
  type ProjectView
} from '../../state/projectViewsStore'
import type { HalfIndex } from '../../state/chatPair'
import { closeChatHalf, openSession, splitChat } from '../../state/sessionNavigation'
import { usePaneStatus } from '../../state/sessionStatusStore'
import { IDE_PANELS_SHORTCUT, SHELL_DRAWER_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { itemsToMarkdown } from '../chat/exportMarkdown'
import { pickPastSession } from '../../state/launcherStore'
import { AccountMismatchNotice, HostedAccountBadge, ObservedAccountBadge } from './ChatAccountBadge'
import { CurrentTicketStrip } from './CurrentTicketStrip'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { HeaderRow } from '../ui/HeaderRow'
import { MenuItem } from '../ui/MenuItem'
import { Popover, PopoverMenu } from '../ui/Popover'
import { StatusTag } from '../ui/StatusDot'
import { StatusPill } from '../ui/StatusPill'
import { TAKE_OVER_TOOLTIP, useTakeOverStore, type TakeOverTarget } from '../../state/takeOverStore'
import { Toolbar } from '../ui/Toolbar'

const MODELS: ClaudeModel[] = ['sonnet', 'opus', 'haiku']

function SessionIdentity({ workspace }: { workspace: Workspace }) {
  return (
    <>
      <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} />
      {workspace.worktreeTag && <Badge>{workspace.worktreeTag}</Badge>}
    </>
  )
}

/** Where a header's chat sits in the chat area. */
export interface HalfPlace {
  half: HalfIndex
  split: boolean
  focused: boolean
}

/** Split from a lone chat; take a chat off screen when two are shown (or always, for an observed one). */
function HalfControls({ place, closable }: { place: HalfPlace; closable: boolean }) {
  return (
    <>
      {!place.split && (
        <Button variant="ghost" onClick={splitChat} label="Split" tooltip="Open a second session beside this one (or Ctrl+click a session in the list)">
          <Columns2 size={14} strokeWidth={2} />
        </Button>
      )}
      {(place.split || closable) && (
        <Button variant="ghost" onClick={() => closeChatHalf(place.half)} label="Close this half" tooltip="Take this session off screen; it keeps running">
          <X size={14} strokeWidth={2} />
        </Button>
      )}
    </>
  )
}

interface HostedProps {
  workspace: Workspace
  view: ProjectView
  session: ClaudeChatSession
  place: HalfPlace
}

export function HostedSessionHeader({ workspace, view, session, place }: HostedProps) {
  const status = usePaneStatus(session.id)
  const toggleIdePanels = useProjectViewsStore((s) => s.toggleIdePanels)
  const toggleShellDrawer = useProjectViewsStore((s) => s.toggleShellDrawer)
  const drawerOpen = view.shellDrawerOpen && view.shellTabs.length > 0

  return (
    <>
      <Toolbar
        highlighted={place.split && place.focused}
        actions={
          <span className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              pressed={view.idePanelsOpen}
              onClick={() => toggleIdePanels(view.projectId)}
              label="IDE panels"
              tooltip={`${view.idePanelsOpen ? 'Hide' : 'Show'} file tree, editor and git (${IDE_PANELS_SHORTCUT})`}
            >
              <PanelLeft size={14} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              pressed={drawerOpen}
              onClick={() => toggleShellDrawer(view.projectId)}
              label="Shell"
              tooltip={
                view.shellTabs.length === 0
                  ? `Open a shell (${SHELL_DRAWER_SHORTCUT})`
                  : `${drawerOpen ? 'Hide' : 'Show'} shells (${SHELL_DRAWER_SHORTCUT})`
              }
            >
              <Terminal size={14} strokeWidth={2} />
            </Button>
            <ChatMenu view={view} session={session} />
            <HalfControls place={place} closable={false} />
          </span>
        }
      >
        <HeaderRow icon={<SessionIdentity workspace={workspace} />} title={session.title}>
          <HostedAccountBadge workspace={workspace} paneId={session.id} />
          <StatusTag status={status} />
        </HeaderRow>
      </Toolbar>
      <AccountMismatchNotice workspace={workspace} paneId={session.id} />
      <CurrentTicketStrip workspace={workspace} paneId={session.id} />
    </>
  )
}

function ChatMenu({ view, session }: { view: ProjectView; session: ClaudeChatSession }) {
  const menu = useMenu()
  const store = useProjectViewsStore

  const act = (fn: () => void) => () => {
    menu.close()
    fn()
  }

  const newChat = (model: ClaudeModel) => {
    const created = store.getState().addClaudeSession(view.projectId, { model })
    if (created) openSession(created.id)
  }

  const duplicate = () => {
    const dup = store.getState().duplicateSession(view.projectId, session.id)
    if (dup) openSession(dup.id)
  }

  const exportMarkdown = async () => {
    const items = useChatItemsStore.getState().items[session.id] ?? []
    if (items.length === 0) {
      alert('nothing to export — this session has no messages yet.')
      return
    }
    const title = `${view.projectName} — ${session.title}`
    await window.api.files.saveAs(`${title.replace(/[^\w.-]+/g, '_')}.md`, itemsToMarkdown(items, title))
  }

  const clear = () => {
    const ok = confirm('Clear this session? Messages and the claude session id will be wiped (process restarts fresh on next send).')
    if (!ok) return
    window.api.claude.stop(session.id)
    useChatItemsStore.getState().clearItems(session.id)
    store.getState().clearClaudeSessionId(session.id)
  }

  return (
    <>
      <span ref={menu.setAnchor} className="inline-flex">
        <Button variant="ghost" pressed={menu.open} onClick={menu.toggle} label="more actions" tooltip="more actions">
          <MoreHorizontal size={14} strokeWidth={2} />
        </Button>
      </span>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" label="session actions">
        <PopoverMenu label="session actions">
          {MODELS.map((m) => (
            <MenuItem key={m} icon={MessageCirclePlus} label={`new ${m} session here`} onClick={act(() => newChat(m))} />
          ))}
          <MenuItem
            icon={History}
            label="load past session…"
            description="resume any previous claude session in this workspace"
            onClick={act(() => pickPastSession(view.projectId))}
          />
          <MenuItem icon={Copy} label="duplicate session" description="copy model + perms, fresh history" onClick={act(duplicate)} />
          <MenuItem icon={Download} label="export to markdown…" description="save the conversation as .md" onClick={act(() => void exportMarkdown())} />
          <MenuItem
            icon={PieChart}
            label="show /usage"
            description="how to view subscription usage"
            onClick={act(() => alert('Type /usage in the input and press Enter to see your subscription usage breakdown.'))}
          />
          <MenuItem icon={Trash2} label="clear session" description="wipe items + session id (process restarts fresh)" onClick={act(clear)} />
        </PopoverMenu>
      </Popover>
    </>
  )
}

interface ObservedProps {
  workspace: Workspace
  session?: ObservedSession
  sessionId: string
  place: HalfPlace
}

export function ObservedSessionHeader({ workspace, session, sessionId, place }: ObservedProps) {
  const title = session?.title ?? sessionId.slice(0, 8)
  return (
    <Toolbar
      highlighted={place.split && place.focused}
      actions={
        <span className="flex shrink-0 items-center gap-1">
          <TakeOverControls workspaceId={workspace.id} sessionId={sessionId} title={title} />
          <HalfControls place={place} closable />
        </span>
      }
    >
      <HeaderRow icon={<SessionIdentity workspace={workspace} />} title={title} note="read-only · reply in VS Code">
        <Badge>in VS Code</Badge>
        <ObservedAccountBadge workspace={workspace} sessionId={sessionId} status={session?.status} />
        <StatusTag status={session?.status ?? 'quiet'} />
      </HeaderRow>
    </Toolbar>
  )
}

/** Take over, or while it waits for VS Code's turn to end, the wait with Now and Cancel. */
function TakeOverControls({ workspaceId, sessionId, title }: TakeOverTarget) {
  const waiting = useTakeOverStore((s) => sessionId in s.pending)
  const request = useTakeOverStore((s) => s.request)
  const cancel = useTakeOverStore((s) => s.cancel)
  const target = { workspaceId, sessionId, title }
  if (!waiting) {
    return (
      <Button variant="secondary" onClick={() => request(target)} tooltip={TAKE_OVER_TOOLTIP}>
        Take over
      </Button>
    )
  }
  return (
    <>
      <StatusPill tone="on" icon={<Loader2 size={11} className="animate-spin" />} label="Taking over when done…" tooltip="Hands over once VS Code's agent finishes its turn" />
      <Button variant="ghost" onClick={() => request(target, { now: true })} tooltip="Hand over without waiting for the turn to end">
        Now
      </Button>
      <Button variant="ghost" onClick={() => cancel(sessionId)}>
        Cancel
      </Button>
    </>
  )
}

/** The header of a half that waits for a session to be picked. */
export function EmptyHalfHeader({ place }: { place: HalfPlace }) {
  return (
    <Toolbar highlighted={place.focused} actions={<HalfControls place={place} closable />}>
      <HeaderRow title="Pick a session" note="Click a session in the list to open it here" />
    </Toolbar>
  )
}
