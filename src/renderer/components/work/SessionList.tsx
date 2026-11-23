import { useState, type MouseEvent } from 'react'
import { useAccountColor } from '../../state/useAccountColor'
import { AccentDot } from '../ui/AccentDot'
import { AccountUsageLines } from '../AccountUsage'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { useUsageEntries } from '../../state/useUsageEntries'
import { useMenu } from '../../hooks/useMenu'
import { Columns2, History, MoreHorizontal, PanelLeftClose, Pencil, Plus, X } from 'lucide-react'
import { SESSION_LIST_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useSessionListStore } from '../../state/sessionListStore'
import { OBSERVED_STATUS_LABEL } from '../../../shared/types'
import { STATUS_LABEL } from '../../../shared/needsYou'
import type { AccountSection, SessionGroup, SessionGroupId, SessionRow } from '../../state/sessionList'
import { useChatPairStore } from '../../state/chatPairStore'
import { pickPastSession, pickProject } from '../../state/launcherStore'
import { closeSession } from '../../state/sessionNavigation'
import { renameHostedSession } from '../../state/sessionTitleSync'
import { isShown, openRow, useAccountSectionsStore, useSessionSections, useWorkSearchStore } from '../../state/workSessions'
import type { ChatPair } from '../../state/chatPair'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { IconButton } from '../ui/IconButton'
import { ListGroup } from '../ui/ListGroup'
import { ListRow, ListRowLabel, ListRowText } from '../ui/ListRow'
import { MenuItem } from '../ui/MenuItem'
import { Popover, PopoverMenu } from '../ui/Popover'
import { SearchField } from '../ui/SearchField'
import { EmptyHint } from '../ui/Section'
import { StatusDot } from '../ui/StatusDot'
import { TextField } from '../ui/TextField'

const GROUP_TITLE: Record<SessionGroupId, string> = {
  'needs-you': 'Needs you',
  running: 'Running',
  idle: 'Idle',
  'in-vscode': 'In VS Code'
}

export function SessionList() {
  const { sections, headed } = useSessionSections()
  const pair = useChatPairStore((s) => s.pair)
  const search = useWorkSearchStore((s) => s.search)
  const setSearch = useWorkSearchStore((s) => s.setSearch)
  const collapsed = useAccountSectionsStore((s) => s.collapsed)
  const toggle = useAccountSectionsStore((s) => s.toggle)
  const [renaming, setRenaming] = useState<string | null>(null)
  const groups = (section: AccountSection) => (
    <StatusGroups groups={section.groups} pair={pair} renaming={renaming} setRenaming={setRenaming} />
  )

  return (
    <nav aria-label="Sessions" className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <span className="min-w-0 flex-1">
          <Button onClick={pickProject} tooltip="Start a session in a workspace (Ctrl+T)">
            <Plus size={12} />
            New session
          </Button>
        </span>
        <ListMenu />
        <IconButton onClick={() => useSessionListStore.getState().toggle()} label="Hide sessions" tooltip={`Hide sessions (${SESSION_LIST_SHORTCUT})`}>
          <PanelLeftClose size={14} />
        </IconButton>
      </div>
      <div className="shrink-0 p-2">
        <SearchField label="Search sessions" placeholder="Search title, repo or worktree" value={search} onChange={setSearch} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-2">
        {sections.length === 0 && <EmptyHint>{search.trim() ? 'No session matches.' : 'No sessions yet.'}</EmptyHint>}
        {headed
          ? sections.map((section) => (
              <CollapsibleSection
                key={section.account.profileId}
                title={section.account.label}
                open={!collapsed.includes(section.account.profileId)}
                onToggle={() => toggle(section.account.profileId)}
                tooltip={`Sessions on the account ${section.account.label}`}
                marker={<AccountMarker profileId={section.account.profileId} />}
                detail={<SectionUsage profileId={section.account.profileId} />}
                badge={
                  section.needsYou > 0 && (
                    <Badge tone="count" tooltip={`${section.needsYou} ${section.needsYou === 1 ? 'session needs' : 'sessions need'} you`}>
                      {section.needsYou}
                    </Badge>
                  )
                }
              >
                {groups(section)}
              </CollapsibleSection>
            ))
          : sections.map((section) => <div key={section.account.profileId}>{groups(section)}</div>)}
      </div>
    </nav>
  )
}

interface StatusGroupsProps {
  groups: SessionGroup[]
  pair: ChatPair
  renaming: string | null
  setRenaming: (key: string | null) => void
}

function StatusGroups({ groups, pair, renaming, setRenaming }: StatusGroupsProps) {
  return groups.map((g) => (
    <ListGroup key={g.id} title={GROUP_TITLE[g.id]} count={g.rows.length}>
      {g.rows.map((row) =>
        row.key === renaming && row.kind === 'hosted' ? (
          <RenameRow key={row.key} paneId={row.paneId} title={row.title} onDone={() => setRenaming(null)} />
        ) : (
          <SessionListRow
            key={row.key}
            row={row}
            active={isShown(row, pair)}
            onRename={row.kind === 'hosted' ? () => setRenaming(row.key) : undefined}
          />
        )
      )}
    </ListGroup>
  ))
}

function rowTooltip(row: SessionRow): string {
  const where = [row.repoName, row.workspace.worktreeTag].filter(Boolean).join(' · ')
  if (row.kind === 'observed') return `${row.title} · ${where} · ${OBSERVED_STATUS_LABEL[row.status]} in VS Code (read-only)`
  return `${row.title} · ${where} · ${STATUS_LABEL[row.status]} · double-click to rename, Ctrl+click to open beside`
}

function ListMenu() {
  const menu = useMenu()
  return (
    <>
      <IconButton ref={menu.setAnchor} onClick={menu.toggle} label="Session list actions">
        <MoreHorizontal size={14} />
      </IconButton>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" label="Session list actions">
        <PopoverMenu label="Session list actions">
          <MenuItem
            icon={History}
            label="Past sessions…"
            description="Resume an earlier session of a workspace"
            onClick={() => {
              menu.close()
              pickPastSession()
            }}
          />
        </PopoverMenu>
      </Popover>
    </>
  )
}

function SessionListRow({ row, active, onRename }: { row: SessionRow; active: boolean; onRename?: () => void }) {
  const { workspace } = row
  const menu = useMenu()
  const act = (fn: () => void) => () => {
    menu.close()
    fn()
  }
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    menu.show()
  }

  return (
    <ListRow
      active={active}
      onClick={(e) => openRow(row, { focus: false, beside: e.ctrlKey || e.metaKey })}
      onDoubleClick={onRename}
      onContextMenu={onContextMenu}
      tooltip={rowTooltip(row)}
      actionsPinned={menu.open}
      actions={
        <>
          <IconButton ref={menu.setAnchor} onClick={menu.toggle} label="Session actions">
            <MoreHorizontal size={14} />
          </IconButton>
          <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" label="Session actions">
            <PopoverMenu label="Session actions">
              <MenuItem icon={Columns2} label="Open beside" description="Ctrl+click" onClick={act(() => openRow(row, { focus: false, beside: true }))} />
              {onRename && <MenuItem icon={Pencil} label="Rename" onClick={act(onRename)} />}
              {row.kind === 'hosted' && (
                <MenuItem
                  icon={X}
                  label="Close"
                  description="Stops the session; resume it from Past sessions…"
                  onClick={act(() => closeSession(row.paneId))}
                />
              )}
            </PopoverMenu>
          </Popover>
        </>
      }
    >
      <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />
      {workspace.worktreeTag && <Badge>{workspace.worktreeTag}</Badge>}
      <ListRowText primary={row.title} />
      {row.kind === 'hosted' && row.modelTag && <ListRowLabel tone="secondary">{row.modelTag}</ListRowLabel>}
      <StatusDot status={row.status} />
    </ListRow>
  )
}

function RenameRow({ paneId, title, onDone }: { paneId: string; title: string; onDone: () => void }) {
  return (
    <li className="px-2 py-0.5">
      <TextField
        label="Session title"
        initialValue={title}
        autoFocus
        submitOnBlur
        onSubmit={(name) => {
          renameHostedSession(paneId, name)
          onDone()
        }}
        onCancel={onDone}
      />
    </li>
  )
}

function AccountMarker({ profileId }: { profileId: string }) {
  return <AccentDot color={useAccountColor(profileId)} />
}

function SectionUsage({ profileId }: { profileId: string }) {
  const color = useAccountColor(profileId)
  const entry = useUsageEntries(null, useMinuteClock()).find((e) => e.profileId === profileId)
  return entry ? <AccountUsageLines entry={entry} color={color} /> : null
}
