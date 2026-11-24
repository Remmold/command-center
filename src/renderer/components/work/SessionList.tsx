import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { useAccountColor } from '../../state/useAccountColor'
import { AccentDot } from '../ui/AccentDot'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { useUsageEntries } from '../../state/useUsageEntries'
import { useMenu } from '../../hooks/useMenu'
import { Columns2, History, MoreHorizontal, PanelLeftClose, Pencil, Plus, X } from 'lucide-react'
import { SESSION_LIST_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useSessionListStore } from '../../state/sessionListStore'
import { isNeedsYouRow, repoFoldKey, sessionRowTooltip, waitingBadge, type AccountSection, type ListFold, type RepoGroup, type SessionRow } from '../../state/sessionList'
import { sectionTitle } from '../../state/accounts'
import { headerUsage, type HeaderTone } from '../../state/usageModel'
import { useChatPairStore } from '../../state/chatPairStore'
import { pickPastSession, pickProject } from '../../state/launcherStore'
import { closeSession } from '../../state/sessionNavigation'
import { renameHostedSession } from '../../state/sessionTitleSync'
import { isShown, openRow, useAccountSectionsStore, useListFold, useSessionSections, useWorkSearchStore } from '../../state/workSessions'
import type { ChatPair } from '../../state/chatPair'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { IconButton } from '../ui/IconButton'
import { ListRow, ListRowLabel, ListRowMeta, ListRowSlot, ListRowText } from '../ui/ListRow'
import { MenuItem } from '../ui/MenuItem'
import { MeterReading, type MeterTone } from '../ui/Meter'
import { Popover, PopoverMenu } from '../ui/Popover'
import { SearchField } from '../ui/SearchField'
import { EmptyHint } from '../ui/Section'
import { StatusDot } from '../ui/StatusDot'
import { TextField } from '../ui/TextField'
import { VsCodeGlyph } from '../ui/VsCodeGlyph'

const VSCODE_TOOLTIP = 'In VS Code — read-only; Take over to continue here'

export function SessionList() {
  const { sections, headed } = useSessionSections()
  const pair = useChatPairStore((s) => s.pair)
  const search = useWorkSearchStore((s) => s.search)
  const setSearch = useWorkSearchStore((s) => s.setSearch)
  const fold = useListFold(headed)
  const [renaming, setRenaming] = useState<string | null>(null)
  const repos = (section: AccountSection) =>
    section.repos.map((group) => (
      <RepoSection key={group.repoGroupKey} profileId={section.account.profileId} group={group} fold={fold}>
        <SessionRows rows={group.rows} pair={pair} renaming={renaming} setRenaming={setRenaming} />
      </RepoSection>
    ))

  return (
    <nav aria-label="Sessions" className="work-list flex h-full min-h-0 flex-col bg-sidebar">
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
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        {sections.length === 0 && <EmptyHint>{search.trim() ? 'No session matches.' : 'No sessions yet.'}</EmptyHint>}
        {headed
          ? sections.map((section) => (
              <AccountGroup key={section.account.profileId} section={section} open={!fold.accounts.includes(section.account.profileId)}>
                {repos(section)}
              </AccountGroup>
            ))
          : sections.map((section) => <div key={section.account.profileId}>{repos(section)}</div>)}
      </div>
    </nav>
  )
}

function RepoSection({ profileId, group, fold, children }: { profileId: string; group: RepoGroup; fold: ListFold; children: ReactNode }) {
  const key = repoFoldKey(profileId, group.repoGroupKey)
  const open = !fold.repos.includes(key)
  const { workspace } = group
  return (
    <CollapsibleSection
      level="group"
      title={group.repoName}
      open={open}
      onToggle={() => useAccountSectionsStore.getState().toggleRepo(key)}
      marker={<RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />}
      badge={
        <>
          <WaitingBadge needsYou={group.needsYou} name={group.repoName} open={open} />
          {!open && <ListRowMeta>{group.rows.length}</ListRowMeta>}
        </>
      }
    >
      <ul>{children}</ul>
    </CollapsibleSection>
  )
}

const READING_TONE: Record<HeaderTone, MeterTone> = { neutral: 'neutral', ahead: 'warn', limit: 'limit' }

function AccountGroup({ section, open, children }: { section: AccountSection; open: boolean; children: ReactNode }) {
  const { account } = section
  const color = useAccountColor(account.profileId)
  const entry = useUsageEntries(null, useMinuteClock()).find((e) => e.profileId === account.profileId)
  const usage = useMemo(() => (entry ? headerUsage(entry) : null), [entry])
  const title = sectionTitle(account)
  const fallback = [`Sessions on the account ${account.label}`, ...(account.email ? [account.email] : [])].join('\n')
  return (
    <CollapsibleSection
      title={title}
      open={open}
      onToggle={() => useAccountSectionsStore.getState().toggle(account.profileId)}
      tooltip={usage?.tooltip ?? fallback}
      marker={<AccentDot color={color} />}
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
  rows: SessionRow[]
  pair: ChatPair
  renaming: string | null
  setRenaming: (key: string | null) => void
}

function SessionRows({ rows, pair, renaming, setRenaming }: SessionRowsProps) {
  return rows.map((row) =>
    row.key === renaming && row.kind === 'hosted' ? (
      <RenameRow key={row.key} paneId={row.paneId} title={row.title} onDone={() => setRenaming(null)} />
    ) : (
      <SessionListRow key={row.key} row={row} active={isShown(row, pair)} onRename={row.kind === 'hosted' ? () => setRenaming(row.key) : undefined} />
    )
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
      tooltip={sessionRowTooltip(row)}
      actionsPinned={menu.open}
      edge={isNeedsYouRow(row) ? 'waiting' : undefined}
      size="roomy"
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
      <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} />
      {workspace.worktreeTag && <Badge>{workspace.worktreeTag}</Badge>}
      <ListRowText primary={row.title} />
      {row.kind === 'hosted' && row.modelTag && <ListRowLabel tone="secondary" hideWhenNarrow>{row.modelTag}</ListRowLabel>}
      {row.kind === 'observed' && <VsCodeGlyph tooltip={VSCODE_TOOLTIP} />}
      <StatusDot status={row.status} look="soft" />
    </ListRow>
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

function WaitingBadge({ needsYou, name, open }: { needsYou: number; name: string; open: boolean }) {
  const badge = waitingBadge(needsYou, name, open)
  return badge && <Badge tone="waiting" tooltip={badge.tooltip}>{badge.text}</Badge>
}
