import { useCallback, useState } from 'react'
import {
  Copy,
  Download,
  History,
  MessageCirclePlus,
  MoreHorizontal,
  PanelLeft,
  PieChart,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Terminal,
  Trash2,
  X,
  type LucideIcon
} from 'lucide-react'
import type { ObservedSession, Workspace } from '../../../shared/types'
import { useChatItemsStore } from '../../state/chatItemsStore'
import { useObservedStore } from '../../state/observedStore'
import {
  PERMISSION_MODES,
  useProjectViewsStore,
  type ClaudeChatSession,
  type ClaudeModel,
  type PermissionMode,
  type ProjectView
} from '../../state/projectViewsStore'
import { openSession } from '../../state/sessionNavigation'
import { usePaneStatus } from '../../state/sessionStatusStore'
import { IDE_PANELS_SHORTCUT, SHELL_DRAWER_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { itemsToMarkdown } from '../chat/exportMarkdown'
import { PastSessionsModal } from '../PastSessionsModal'
import { ProfilePicker } from '../ProfilePicker'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { HeaderRow } from '../ui/HeaderRow'
import { MenuItem } from '../ui/MenuItem'
import { Popover, PopoverMenu } from '../ui/Popover'
import { StatusTag } from '../ui/StatusDot'
import { Toolbar } from '../ui/Toolbar'

const PERMISSION: Record<PermissionMode, { label: string; hint: string; icon: LucideIcon }> = {
  ask: { label: 'ask (popup)', hint: 'shows an inline approval popup for every tool call', icon: ShieldAlert },
  acceptEdits: {
    label: 'accept edits',
    hint: 'auto-approves file edits, popup for everything else (bash, web, etc.)',
    icon: ShieldCheck
  },
  bypassPermissions: { label: 'bypass (yolo)', hint: 'no prompts — use only in trusted dirs', icon: ShieldOff },
  plan: { label: 'plan (read-only)', hint: 'no tool execution at all — research only', icon: Shield }
}

const MODELS: ClaudeModel[] = ['sonnet', 'opus', 'haiku']

function SessionIdentity({ workspace }: { workspace: Workspace }) {
  return (
    <>
      <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} />
      {workspace.worktreeTag && <Badge>{workspace.worktreeTag}</Badge>}
    </>
  )
}

function useMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return { anchor, setAnchor, open, toggle: () => setOpen((o) => !o), close }
}

interface HostedProps {
  workspace: Workspace
  view: ProjectView
  session: ClaudeChatSession
}

export function HostedSessionHeader({ workspace, view, session }: HostedProps) {
  const status = usePaneStatus(session.id)
  const toggleIdePanels = useProjectViewsStore((s) => s.toggleIdePanels)
  const toggleShellDrawer = useProjectViewsStore((s) => s.toggleShellDrawer)
  const drawerOpen = view.shellDrawerOpen && view.shellTabs.length > 0

  return (
    <Toolbar
      actions={
        <span className="flex shrink-0 items-center gap-1">
          <PermissionMenu session={session} />
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
        </span>
      }
    >
      <HeaderRow icon={<SessionIdentity workspace={workspace} />} title={session.title}>
        <ProfilePicker workspace={workspace} labelled />
        <StatusTag status={status} />
      </HeaderRow>
    </Toolbar>
  )
}

function PermissionMenu({ session }: { session: ClaudeChatSession }) {
  const menu = useMenu()
  const setSessionPermissionMode = useProjectViewsStore((s) => s.setSessionPermissionMode)
  const current = PERMISSION[session.permissionMode]

  const choose = (mode: PermissionMode) => {
    setSessionPermissionMode(session.id, mode)
    window.api.claude.stop(session.id)
    menu.close()
  }

  return (
    <>
      <span ref={menu.setAnchor} className="inline-flex">
        <Button variant="ghost" pressed={menu.open} onClick={menu.toggle} tooltip={current.hint} label="permission mode">
          <current.icon size={13} strokeWidth={2} />
          {current.label}
        </Button>
      </span>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" label="permission mode">
        <PopoverMenu label="permission mode">
          {PERMISSION_MODES.map((m) => (
            <MenuItem
              key={m}
              icon={PERMISSION[m].icon}
              label={PERMISSION[m].label}
              description={PERMISSION[m].hint}
              checked={m === session.permissionMode}
              onClick={() => choose(m)}
            />
          ))}
        </PopoverMenu>
      </Popover>
    </>
  )
}

function ChatMenu({ view, session }: { view: ProjectView; session: ClaudeChatSession }) {
  const menu = useMenu()
  const [pastOpen, setPastOpen] = useState(false)
  const store = useProjectViewsStore

  const act = (fn: () => void) => () => {
    menu.close()
    fn()
  }

  const newChat = (model: ClaudeModel) => {
    store.getState().setDefaultModel(model)
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
            onClick={act(() => setPastOpen(true))}
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
      {pastOpen && (
        <PastSessionsModal
          cwd={view.projectPath}
          onClose={() => setPastOpen(false)}
          onLoad={(info) => {
            const loaded = store.getState().loadSessionFromLocal(view.projectId, info.sessionId, info.preview)
            if (loaded) openSession(loaded.id)
          }}
        />
      )}
    </>
  )
}

export function ObservedSessionHeader({ workspace, session, sessionId }: { workspace: Workspace; session?: ObservedSession; sessionId: string }) {
  const close = useObservedStore((s) => s.close)
  return (
    <Toolbar
      actions={
        <Button variant="ghost" onClick={close} label="stop following" tooltip="stop following">
          <X size={14} strokeWidth={2} />
        </Button>
      }
    >
      <HeaderRow icon={<SessionIdentity workspace={workspace} />} title={session?.title ?? sessionId.slice(0, 8)} note="read-only · reply in VS Code">
        <Badge>in VS Code</Badge>
        <StatusTag status={session?.status ?? 'quiet'} />
      </HeaderRow>
    </Toolbar>
  )
}
