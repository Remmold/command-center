import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { useAccountColor } from '../../state/useAccountColor'
import { AccentDot } from '../ui/AccentDot'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { useUsageEntries } from '../../state/useUsageEntries'
import { useMenu } from '../../hooks/useMenu'
import { ChevronLeft, Columns2, FolderInput, FolderPlus, GitBranchPlus, History, MoreHorizontal, PanelLeftClose, Pencil, Plus, Trash2, X } from 'lucide-react'
import { SESSION_LIST_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useSessionListStore } from '../../state/sessionListStore'
import {
  groupOpen,
  guestAccount,
  isNeedsYouRow,
  moveTargets,
  sessionRowTooltip,
  waitingBadge,
  type AccountSection,
  type ListFold,
  type ListGroup,
  type MoveTarget,
  type SessionRow
} from '../../state/sessionList'
import { UNGROUPED } from '../../../shared/sidebarGroups'
import { createGroup, deleteGroup, groupOf, moveChat, moveChatStep, moveChatToNextGroup, moveGroupBeside, renameGroup, setFolded } from '../../state/sidebarGroups'
import { sectionTitle, type Account } from '../../state/accounts'
import { useAccounts } from '../../state/useAccounts'
import { headerUsage, type HeaderTone } from '../../state/usageModel'
import { useChatPairStore } from '../../state/chatPairStore'
import { usePaneProcesses, useProcessServers } from '../../state/backgroundProcessesStore'
import { runningProcesses } from '../../../shared/backgroundProcesses'
import { pickPastSession, pickProject } from '../../state/launcherStore'
import { closeSession } from '../../state/sessionNavigation'
import { renameHostedSession } from '../../state/sessionTitleSync'
import { changeLayout, isShown, openRow, useAccountSectionsStore, useListFold, useSessionSections, useWorkSearchStore } from '../../state/workSessions'
import type { ChatPair } from '../../state/chatPair'
import { useFeaturesStore } from '../../state/featuresStore'
import { FeaturesGroup } from './FeaturesGroup'
import { MainChatRow } from './MainChatRow'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { IconButton } from '../ui/IconButton'
import { ListRow, ListRowLabel, ListRowMeta, ListRowSlot, ListRowText } from '../ui/ListRow'
import { MenuItem } from '../ui/MenuItem'
import { MeterReading, type MeterTone } from '../ui/Meter'
import { Popover, PopoverHeading, PopoverMenu } from '../ui/Popover'
import { SearchField } from '../ui/SearchField'
import { EmptyHint } from '../ui/Section'
import { useSortable, type DragItem } from '../ui/SortableItem'
import { StatusDot } from '../ui/StatusDot'
import { TextField } from '../ui/TextField'
import { VsCodeGlyph } from '../ui/VsCodeGlyph'

const VSCODE_TOOLTIP = 'In VS Code — read-only; Take over to continue here'
const NEW_GROUP_NAME = 'New group'

const CHAT = 'chat'
const GROUP = 'group'

/** A group being renamed, by account and group id. */
interface GroupRef {
  profileId: string
  groupId: string
}

const sameGroup = (a: GroupRef | null, b: GroupRef) => a?.profileId === b.profileId && a.groupId === b.groupId

function newGroup(profileId: string, chat?: string): GroupRef {
  const groupId = crypto.randomUUID()
  changeLayout((layout) => createGroup(layout, profileId, { id: groupId, name: NEW_GROUP_NAME, chat }))
  return { profileId, groupId }
}

const rowElement = (rowKey: string) => document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(rowKey)}"]`)

/** Opens a folded account section, and a folded Ungrouped, that a chat just landed in; true when something had to open. */
function unfoldFor(sections: readonly AccountSection[], fold: ListFold, rowKey: string): boolean {
  const section = sections.find((s) => s.rows.some((r) => r.key === rowKey))
  const group = section?.groups.find((g) => g.rows.some((r) => r.key === rowKey))
  if (!section || !group) return false
  const { profileId } = section.account
  const accountFolded = fold.accounts.includes(profileId)
  const ungroupedFolded = group.id === UNGROUPED && !groupOpen(group, fold)
  if (accountFolded) useAccountSectionsStore.getState().expand(profileId)
  if (ungroupedFolded) changeLayout((layout) => setFolded(layout, profileId, UNGROUPED, false))
  return accountFolded || ungroupedFolded
}

/** A chat that shows up in the list, like a new one at the top of Ungrouped, is scrolled into view, its folded section and Ungrouped opened first. */
function useScrollToAdded(sections: readonly AccountSection[], fold: ListFold, watching: boolean): void {
  const seen = useRef<ReadonlySet<string> | null>(null)
  const opening = useRef<string | null>(null)
  useEffect(() => {
    if (!watching) return
    const keys = sections.flatMap((s) => s.rows.map((r) => r.key))
    const before = seen.current
    seen.current = new Set(keys)
    const added = before && keys.find((k) => !before.has(k))
    const target = added || opening.current
    opening.current = added && unfoldFor(sections, fold, added) ? added : null
    if (target && !opening.current) rowElement(target)?.scrollIntoView({ block: 'nearest' })
  }, [sections, fold, watching])
}

/** After a move remounts the row, focus follows it. */
function refocus(rowKey: string): void {
  requestAnimationFrame(() => rowElement(rowKey)?.focus())
}

export function SessionList() {
  const { sections, headed, loading, layout } = useSessionSections()
  const accounts = useAccounts()
  const pair = useChatPairStore((s) => s.pair)
  const search = useWorkSearchStore((s) => s.search)
  const setSearch = useWorkSearchStore((s) => s.setSearch)
  const fold = useListFold(headed)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renamingGroup, setRenamingGroup] = useState<GroupRef | null>(null)
  useScrollToAdded(sections, fold, !loading && search.trim() === '')
  const groups = (section: AccountSection) => {
    const profileId = section.account.profileId
    const targets = layout ? moveTargets(layout, accounts, profileId) : []
    return section.groups.map((group) => (
      <GroupSection
        key={group.id}
        profileId={profileId}
        group={group}
        fold={fold}
        renaming={sameGroup(renamingGroup, { profileId, groupId: group.id })}
        onRename={() => setRenamingGroup({ profileId, groupId: group.id })}
        onRenamed={() => setRenamingGroup(null)}
      >
        <SessionRows
          profileId={profileId}
          group={group}
          section={section}
          targets={targets}
          accounts={accounts}
          pair={pair}
          renaming={renaming}
          setRenaming={setRenaming}
          onNewGroup={(chat) => setRenamingGroup(newGroup(profileId, chat))}
        />
      </GroupSection>
    ))
  }
  const startGroup = (profileId: string) => {
    setSearch('')
    useAccountSectionsStore.getState().expand(profileId)
    setRenamingGroup(newGroup(profileId))
  }

  return (
    <nav aria-label="Sessions" className="work-list flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <span className="min-w-0 flex-1">
          <Button onClick={pickProject} tooltip="Start a session in a workspace (Ctrl+T)">
            <Plus size={12} />
            New session
          </Button>
        </span>
        <IconButton onClick={() => useFeaturesStore.getState().openDialog()} label="New feature" tooltip="Start a feature: its own worktree and a session that runs /flow">
          <GitBranchPlus size={14} />
        </IconButton>
        <NewGroupButton accounts={sections.map((s) => s.account)} onPick={startGroup} />
        <ListMenu />
        <IconButton onClick={() => useSessionListStore.getState().toggle()} label="Hide sessions" tooltip={`Hide sessions (${SESSION_LIST_SHORTCUT})`}>
          <PanelLeftClose size={14} />
        </IconButton>
      </div>
      <div className="shrink-0 p-2">
        <SearchField label="Search sessions" placeholder="Search title, repo or worktree" value={search} onChange={setSearch} />
      </div>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        <MainChatRow />
        <FeaturesGroup />
        {!loading && sections.length === 0 && <EmptyHint>{search.trim() ? 'No session matches.' : 'No sessions yet.'}</EmptyHint>}
        {headed
          ? sections.map((section) => (
              <AccountGroup
                key={section.account.profileId}
                section={section}
                open={!fold.accounts.includes(section.account.profileId)}
                onNewGroup={() => startGroup(section.account.profileId)}
              >
                {groups(section)}
              </AccountGroup>
            ))
          : sections.map((section) => <div key={section.account.profileId}>{groups(section)}</div>)}
      </div>
    </nav>
  )
}

interface GroupSectionProps {
  profileId: string
  group: ListGroup
  fold: ListFold
  renaming: boolean
  onRename: () => void
  onRenamed: () => void
  children: ReactNode
}

function GroupSection({ profileId, group, fold, renaming, onRename, onRenamed, children }: GroupSectionProps) {
  const open = groupOpen(group, fold)
  const own = group.id !== UNGROUPED
  const menu = useMenu()
  const sortable = useSortable({
    item: { id: group.id, kind: GROUP, group: profileId },
    accepts: (d) => d.kind === CHAT || (d.kind === GROUP && d.group === profileId),
    onDrop: (d, side) => dropOnGroup(profileId, group, d, side),
    sideFor: (d, pointer) => (d.kind === CHAT ? 'after' : pointer)
  })
  const act = (fn: () => void) => () => {
    menu.close()
    fn()
  }

  return (
    <CollapsibleSection
      level="group"
      title={group.name}
      open={open}
      onToggle={() => changeLayout((layout) => setFolded(layout, profileId, group.id, !group.folded))}
      sortable={sortable}
      actionsPinned={menu.open}
      onContextMenu={
        own
          ? (e: MouseEvent) => {
              e.preventDefault()
              menu.show()
            }
          : undefined
      }
      headerSlot={
        renaming ? (
          <TextField
            label="Group name"
            initialValue={group.name}
            autoFocus
            submitOnBlur
            onSubmit={(name) => {
              changeLayout((layout) => renameGroup(layout, profileId, group.id, name))
              onRenamed()
            }}
            onCancel={onRenamed}
          />
        ) : undefined
      }
      actions={
        own && (
          <>
            <IconButton ref={menu.setAnchor} onClick={menu.toggle} label={`Actions for ${group.name}`}>
              <MoreHorizontal size={14} />
            </IconButton>
            <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" label={`Actions for ${group.name}`}>
              <PopoverMenu label={`Actions for ${group.name}`}>
                <MenuItem icon={Pencil} label="Rename" onClick={act(onRename)} />
                <MenuItem
                  icon={Trash2}
                  label="Delete"
                  description="Its chats move to Ungrouped"
                  onClick={act(() => changeLayout((layout) => deleteGroup(layout, profileId, group.id)))}
                />
              </PopoverMenu>
            </Popover>
          </>
        )
      }
      badge={
        <>
          <WaitingBadge needsYou={group.needsYou} name={group.name} open={open} />
          {!open && <ListRowMeta>{group.rows.length}</ListRowMeta>}
        </>
      }
    >
      <ul>{children}</ul>
    </CollapsibleSection>
  )
}

/** A chat dropped on a header goes to the top of that group; a group, Ungrouped included, goes before or after it. */
function dropOnGroup(profileId: string, group: ListGroup, dragged: DragItem, side: 'before' | 'after'): void {
  changeLayout((layout) => {
    if (dragged.kind === CHAT) return moveChat(layout, profileId, dragged.id, { group: group.id, before: group.rows[0]?.placeId ?? null })
    return moveGroupBeside(layout, profileId, dragged.id, group.id, side)
  })
}

const READING_TONE: Record<HeaderTone, MeterTone> = { neutral: 'neutral', ahead: 'warn', limit: 'limit' }

function AccountGroup({ section, open, onNewGroup, children }: { section: AccountSection; open: boolean; onNewGroup: () => void; children: ReactNode }) {
  const { account } = section
  const color = useAccountColor(account.profileId)
  const entry = useUsageEntries(null, useMinuteClock()).find((e) => e.profileId === account.profileId)
  const usage = useMemo(() => (entry ? headerUsage(entry) : null), [entry])
  const menu = useMenu()
  const title = sectionTitle(account)
  const fallback = [`Sessions on the account ${account.label}`, ...(account.email ? [account.email] : [])].join('\n')
  const label = `Actions for ${account.name}`
  return (
    <CollapsibleSection
      title={title}
      open={open}
      onToggle={() => useAccountSectionsStore.getState().toggle(account.profileId)}
      tooltip={usage?.tooltip ?? fallback}
      marker={<AccentDot color={color} />}
      actionsPinned={menu.open}
      onContextMenu={(e) => {
        e.preventDefault()
        menu.show()
      }}
      actions={
        <>
          <IconButton ref={menu.setAnchor} onClick={menu.toggle} label={label}>
            <MoreHorizontal size={14} />
          </IconButton>
          <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" label={label}>
            <PopoverMenu label={label}>
              <MenuItem
                icon={FolderPlus}
                label="New group"
                onClick={() => {
                  menu.close()
                  onNewGroup()
                }}
              />
            </PopoverMenu>
          </Popover>
        </>
      }
      badge={
        <>
          <WaitingBadge needsYou={section.needsYou} name={account.name} open={open} />
          {usage && (
            <MeterReading
              percent={usage.percent}
              tone={READING_TONE[usage.tone]}
              prefix={usage.prefix}
              label={`${account.name} ${usage.label}`}
            />
          )}
        </>
      }
    >
      {children}
    </CollapsibleSection>
  )
}

interface SessionRowsProps {
  profileId: string
  group: ListGroup
  section: AccountSection
  /** Every account's groups, for "Move to group". */
  targets: MoveTarget[]
  accounts: readonly Account[]
  pair: ChatPair
  renaming: string | null
  setRenaming: (key: string | null) => void
  onNewGroup: (chat: string) => void
}

function SessionRows({ profileId, group, section, targets, accounts, pair, renaming, setRenaming, onNewGroup }: SessionRowsProps) {
  return group.rows.map((row, i) =>
    row.key === renaming && row.kind === 'hosted' ? (
      <RenameRow key={row.key} paneId={row.paneId} title={row.title} onDone={() => setRenaming(null)} />
    ) : (
      <SessionListRow
        key={row.key}
        row={row}
        place={{ profileId, group, next: group.rows[i + 1]?.placeId ?? null, section, targets }}
        guest={guestAccount(row, section, accounts)}
        active={isShown(row, pair)}
        onRename={row.kind === 'hosted' ? () => setRenaming(row.key) : undefined}
        onNewGroup={() => onNewGroup(row.placeId)}
      />
    )
  )
}

/** Makes a group at once with one account; with several it asks which account first. */
function NewGroupButton({ accounts, onPick }: { accounts: AccountSection['account'][]; onPick: (profileId: string) => void }) {
  const menu = useMenu()
  if (accounts.length === 0) return null
  if (accounts.length === 1) {
    return (
      <IconButton onClick={() => onPick(accounts[0].profileId)} label="New group">
        <FolderPlus size={14} />
      </IconButton>
    )
  }
  return (
    <>
      <IconButton ref={menu.setAnchor} onClick={menu.toggle} label="New group">
        <FolderPlus size={14} />
      </IconButton>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" label="New group in">
        <PopoverMenu label="New group in">
          {accounts.map((account) => (
            <MenuItem
              key={account.profileId}
              label={account.name}
              onClick={() => {
                menu.close()
                onPick(account.profileId)
              }}
            />
          ))}
        </PopoverMenu>
      </Popover>
    </>
  )
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

/** Where a row sits, for dropping onto it and moving it by keyboard. */
interface RowPlace {
  profileId: string
  group: ListGroup
  /** The chat shown below it in its group. */
  next: string | null
  section: AccountSection
  targets: MoveTarget[]
}

/** Alt+↑/↓ steps the row within its group, Alt+Shift+↑/↓ moves it to the next or previous group, opening that group. */
function moveByKey(e: KeyboardEvent, row: SessionRow, place: RowPlace): void {
  if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
  e.preventDefault()
  const dir = e.key === 'ArrowUp' ? -1 : 1
  const shown = new Set(place.section.rows.map((r) => r.placeId))
  changeLayout((layout) => {
    if (!e.shiftKey) return moveChatStep(layout, place.profileId, row.placeId, shown, dir)
    const moved = moveChatToNextGroup(layout, place.profileId, row.placeId, dir)
    const to = groupOf(moved, place.profileId, row.placeId)
    return to ? setFolded(moved, place.profileId, to, false) : moved
  })
  refocus(row.key)
}

interface SessionListRowProps {
  row: SessionRow
  place: RowPlace
  active: boolean
  /** The account a guest row runs on; null when it sits under its own. */
  guest: Account | null
  onRename?: () => void
  onNewGroup: () => void
}

function SessionListRow({ row, place, active, guest, onRename, onNewGroup }: SessionListRowProps) {
  const { workspace } = row
  const { profileId, group } = place
  const menu = useMenu()
  const [page, setPage] = useState<'actions' | 'move'>('actions')
  const sortable = useSortable({
    item: { id: row.placeId, kind: CHAT, group: profileId },
    accepts: (d) => d.kind === CHAT,
    onDrop: (d, side) =>
      changeLayout((layout) => moveChat(layout, profileId, d.id, { group: group.id, before: side === 'before' ? row.placeId : place.next }))
  })
  const close = () => {
    menu.close()
    setPage('actions')
  }
  const act = (fn: () => void) => () => {
    close()
    fn()
  }
  const moveTo = (to: MoveTarget['account'], group: string) => changeLayout((layout) => moveChat(layout, to.profileId, row.placeId, { group, before: null }))
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
      onKeyDown={(e) => moveByKey(e, row, place)}
      rowKey={row.key}
      tooltip={sessionRowTooltip(row)}
      actionsPinned={menu.open}
      edge={isNeedsYouRow(row) ? 'waiting' : undefined}
      size="roomy"
      sortable={sortable}
      actions={
        <>
          <IconButton ref={menu.setAnchor} onClick={menu.toggle} label="Session actions">
            <MoreHorizontal size={14} />
          </IconButton>
          <Popover open={menu.open} onClose={close} anchor={menu.anchor} align="end" label="Session actions">
            {page === 'actions' ? (
              <PopoverMenu label="Session actions">
                <MenuItem icon={Columns2} label="Open beside" description="Ctrl+click" onClick={act(() => openRow(row, { focus: false, beside: true }))} />
                {onRename && <MenuItem icon={Pencil} label="Rename" onClick={act(onRename)} />}
                <MenuItem icon={FolderInput} label="Move to group" submenu onClick={() => setPage('move')} />
                <MenuItem icon={FolderPlus} label="New group from this chat" onClick={act(onNewGroup)} />
                {row.kind === 'hosted' && (
                  <MenuItem
                    icon={X}
                    label="Close"
                    description="Stops the session; resume it from Past sessions…"
                    onClick={act(() => closeSession(row.paneId))}
                  />
                )}
              </PopoverMenu>
            ) : (
              <PopoverMenu label="Move to group">
                <MenuItem icon={ChevronLeft} label="Move to group" onClick={() => setPage('actions')} />
                {place.targets.map(({ account, groups }) => (
                  <Fragment key={account.profileId}>
                    {place.targets.length > 1 && (
                      <div className="pt-1.5">
                        <PopoverHeading title={account.name} />
                      </div>
                    )}
                    {groups.map((t) => (
                      <MenuItem
                        key={t.id}
                        label={t.name}
                        disabled={account.profileId === profileId && t.id === group.id}
                        onClick={act(() => moveTo(account, t.id))}
                      />
                    ))}
                  </Fragment>
                ))}
              </PopoverMenu>
            )}
          </Popover>
        </>
      }
    >
      <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} />
      {workspace.worktreeTag && <Badge>{workspace.worktreeTag}</Badge>}
      <ListRowText primary={row.title} />
      {guest && <GuestTag account={guest} />}
      {row.kind === 'hosted' && row.modelTag && <ListRowLabel tone="secondary" hideWhenNarrow>{row.modelTag}</ListRowLabel>}
      {row.kind === 'observed' && <VsCodeGlyph tooltip={VSCODE_TOOLTIP} />}
      {row.kind === 'hosted' && <ProcessesBadge paneId={row.paneId} />}
      <StatusDot status={row.status} look="soft" />
    </ListRow>
  )
}

/** Names the account a guest session runs on, in its colour. */
function GuestTag({ account }: { account: Account }) {
  return (
    <Badge tone="muted" accent={useAccountColor(account.profileId)} tooltip={`Runs on ${sectionTitle(account)}`}>
      {account.name}
    </Badge>
  )
}

function RenameRow({ paneId, title, onDone }: { paneId: string; title: string; onDone: () => void }) {
  return (
    <ListRowSlot>
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
    </ListRowSlot>
  )
}

/** The session's running background processes; its tooltip has one line per process, with each confirmed port. */
function ProcessesBadge({ paneId }: { paneId: string }) {
  const processes = usePaneProcesses(paneId)
  const servers = useProcessServers(paneId)
  const running = runningProcesses(processes)
  if (running.length === 0) return null
  const tooltip = running.map((p) => [p.command, ...(servers[p.taskId] ?? []).map((s) => `:${s.port}`)].join(' ')).join('\n')
  return (
    <Badge tone="muted" tooltip={tooltip} label={`${running.length} background ${running.length === 1 ? 'process' : 'processes'} running`}>
      {running.length}
    </Badge>
  )
}

function WaitingBadge({ needsYou, name, open }: { needsYou: number; name: string; open: boolean }) {
  const badge = waitingBadge(needsYou, name, open)
  return badge && <Badge tone="waiting" tooltip={badge.tooltip}>{badge.text}</Badge>
}
