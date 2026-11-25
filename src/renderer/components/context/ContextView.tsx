import { useEffect, useMemo, useState } from 'react'
import { Bot, Brain, ChevronDown, FileText, FolderGit2, FolderTree, Plug, Puzzle, Settings2, Sparkles, SquareSlash, UserRound, type LucideIcon } from 'lucide-react'
import { buildCleanup, type CleanupKind, type CleanupProject } from '../../../shared/cleanup'
import {
  CREATABLE_NAMES,
  KIND_GROUP_TITLES,
  countedTokens,
  formatTokens,
  groupByKind,
  type ContextItem,
  type ContextLayerName,
  type ContextReport,
  type CreatableContextFile,
  type KindGroup,
  type KindGroupName
} from '../../../shared/context'
import { DEFAULT_PROFILE_ID, type Workspace } from '../../../shared/types'
import { workspacesByAccount, sectionTitle, type AccountWorkspaces } from '../../state/accounts'
import { useAccountColor } from '../../state/useAccountColor'
import { useAccounts } from '../../state/useAccounts'
import { useContextStore } from '../../state/contextStore'
import { useMenu } from '../../hooks/useMenu'
import { startSession } from '../../state/sessionNavigation'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { setViewLeaveGuard } from '../../state/viewStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { AccentDot } from '../ui/AccentDot'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { EmptyState } from '../ui/EmptyState'
import { ListItem, ListRow, ListRowLabel, ListRowMeta, ListRowNote, ListRowText } from '../ui/ListRow'
import { MenuItem } from '../ui/MenuItem'
import { NoticeLine } from '../ui/NoticeLine'
import { Pane } from '../ui/Pane'
import { Panel } from '../ui/Panel'
import { Popover, PopoverMenu } from '../ui/Popover'
import { ScrollStack } from '../ui/ScrollStack'
import { ShareBar } from '../ui/ShareBar'
import { SidebarLayout } from '../ui/SidebarLayout'
import { ContextEditor } from './ContextEditor'
import { CrossProjectCleanupDialog } from './CrossProjectCleanupDialog'

/** The workspace last open in Work, else the one already picked, else the first. */
function startWorkspace(workspaces: readonly Workspace[], openInWork: string | null, picked: string | null): string | null {
  const known = (id: string | null): id is string => id !== null && workspaces.some((w) => w.id === id)
  if (known(openInWork)) return openInWork
  if (known(picked)) return picked
  return workspaces[0]?.id ?? null
}

export function ContextView() {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const selectedId = useContextStore((s) => s.selectedId)
  const report = useContextStore((s) => s.report)
  const loaded = workspaces.length > 0

  useEffect(() => {
    if (!loaded) return
    const { select, selectedId: picked } = useContextStore.getState()
    select(startWorkspace(useWorkspacesStore.getState().workspaces, useProjectViewsStore.getState().activeProjectId, picked))
  }, [loaded])

  useEffect(() => {
    const refresh = (): void => useContextStore.getState().refresh()
    window.addEventListener('focus', refresh)
    setViewLeaveGuard(() => useContextStore.getState().confirmLeave())
    return () => {
      window.removeEventListener('focus', refresh)
      setViewLeaveGuard(null)
    }
  }, [])

  const defaultName = useAccounts().find((a) => a.profileId === DEFAULT_PROFILE_ID)?.name ?? 'Personal'
  const selected = workspaces.find((w) => w.id === selectedId) ?? null
  return (
    <SidebarLayout sidebar={<WorkspaceList workspaces={workspaces} selectedId={selectedId} />}>
      {selected ? (
        <div className="flex h-full min-h-0">
          <div className="min-h-0 w-[28rem] shrink-0 border-r border-subtle">
            <Layers key={selected.id} workspace={selected} report={report} defaultName={defaultName} />
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            <ContextEditor defaultName={defaultName} workspacePath={selected.path} />
          </div>
        </div>
      ) : (
        <EmptyState>{loaded ? 'Pick a workspace.' : 'No workspaces yet.'}</EmptyState>
      )}
    </SidebarLayout>
  )
}

function WorkspaceList({ workspaces, selectedId }: { workspaces: Workspace[]; selectedId: string | null }) {
  const accounts = useAccounts()
  const byAccount = useMemo(() => workspacesByAccount(workspaces, accounts), [workspaces, accounts])
  return (
    <nav aria-label="Workspaces" className="flex flex-col gap-3 py-2">
      {byAccount.map((group) => (
        <AccountWorkspaceList key={group.account.profileId} group={group} selectedId={selectedId} />
      ))}
    </nav>
  )
}

function AccountWorkspaceList({ group, selectedId }: { group: AccountWorkspaces; selectedId: string | null }) {
  const color = useAccountColor(group.account.profileId)
  const totals = useContextStore((s) => s.totals)
  const [open, setOpen] = useState(true)
  return (
    <CollapsibleSection title={sectionTitle(group.account)} open={open} onToggle={() => setOpen(!open)} marker={<AccentDot color={color} />}>
      <ul>
        {group.workspaces.map((w) => {
          const total = totals[w.id]
          return (
            <ListRow key={w.id} active={w.id === selectedId} tooltip={w.path} onClick={() => useContextStore.getState().select(w.id)}>
              <ListRowText primary={w.name} secondary={total === undefined ? undefined : total === null ? 'folder gone' : formatTokens(total)} />
            </ListRow>
          )
        })}
      </ul>
    </CollapsibleSection>
  )
}

/** A creatable file's path inside the workspace folder, in the folder's own separator. */
function creatablePath(workspacePath: string, file: CreatableContextFile): string {
  const sep = workspacePath.includes('\\') ? '\\' : '/'
  return `${workspacePath.replace(/[\\/]+$/, '')}${sep}${CREATABLE_NAMES[file]}`
}

function CreateLine({ workspacePath, file }: { workspacePath: string; file: CreatableContextFile }) {
  const name = CREATABLE_NAMES[file]
  const create = (): void =>
    useContextStore.getState().open({ path: creatablePath(workspacePath, file), label: name, sharedWithDefault: false, readOnly: null, creating: true })
  return (
    <NoticeLine action={<Button variant="secondary" onClick={create} label={`Create ${name}`}>Create</Button>}>
      No {name} in this workspace.
    </NoticeLine>
  )
}

const GROUP_ICONS: Record<KindGroupName, LucideIcon> = {
  'claude-md': FileText,
  memory: Brain,
  skills: Sparkles,
  agents: Bot,
  commands: SquareSlash,
  'mcp-servers': Plug,
  plugins: Puzzle,
  settings: Settings2
}

const FOLD_WHEN_LONG: ReadonlySet<KindGroupName> = new Set(['skills', 'agents', 'commands'])
const LONG_GROUP = 8

const LAYERS: readonly ContextLayerName[] = ['account', 'repo', 'local']
const LAYER_TITLES: Record<ContextLayerName, string> = { account: 'Account', repo: 'Repo', local: 'Local' }

function LayerShares({ report, atStart }: { report: ContextReport; atStart: Record<ContextLayerName, ContextItem[]> }) {
  if (report.startTotal === 0) return null
  const segments = LAYERS.map((layer) => {
    const tokens = countedTokens(atStart[layer]) ?? 0
    return { label: LAYER_TITLES[layer], value: tokens, detail: `${formatTokens(tokens)} tokens` }
  })
  return <ShareBar label="Start total by layer" segments={segments} />
}

function Layers({ workspace, report, defaultName }: { workspace: Workspace; report: ContextReport | null; defaultName: string }) {
  if (!report) return <EmptyState>Reading…</EmptyState>
  if (!report.folderExists) return <EmptyState>The folder {workspace.path} is gone, so nothing loads here.</EmptyState>
  const atStart = { ...report.layers, repo: report.layers.repo.filter((i) => i.kind !== 'subfolder-claude-md') }
  const subfolders = report.layers.repo.filter((i) => i.kind === 'subfolder-claude-md')
  return (
    <Pane label="Context layers">
      <NoticeLine strip action={<CleanupMenu workspace={workspace} report={report} />}>
        Start total {formatTokens(report.startTotal)} tokens · estimates, as configured
      </NoticeLine>
      <ScrollStack padded>
        <LayerShares report={report} atStart={atStart} />
        <LayerPanel title={LAYER_TITLES.account} items={atStart.account} defaultName={defaultName} />
        <LayerPanel title={LAYER_TITLES.repo} items={atStart.repo} defaultName={defaultName} />
        {report.missing.includes('repo-claude-md') && <CreateLine workspacePath={report.workspacePath} file="repo-claude-md" />}
        <LayerPanel title={LAYER_TITLES.local} items={atStart.local} defaultName={defaultName} />
        {report.missing.includes('claude-local-md') && <CreateLine workspacePath={report.workspacePath} file="claude-local-md" />}
        {subfolders.length > 0 && (
          <Panel title="Loads when Claude works there" count={subfolders.length} empty="Nothing here.">
            <ItemList items={subfolders} defaultName={defaultName} />
          </Panel>
        )}
      </ScrollStack>
    </Pane>
  )
}

/** A new session in the workspace, on its account, with the cleanup prompt waiting in its input. Callers ask about unsaved edits first. */
function startCleanup(workspace: Workspace, report: ContextReport, accountName: string, kind: CleanupKind, projects: CleanupProject[]): void {
  const { prompt, addDirs } = buildCleanup({
    kind,
    sessionPath: workspace.path,
    account: { name: accountName, folder: report.accountFolder, items: report.layers.account },
    projects
  })
  startSession(workspace, { draft: prompt, addDirs })
}

function CleanupMenu({ workspace, report }: { workspace: Workspace; report: ContextReport }) {
  const menu = useMenu()
  const [picking, setPicking] = useState(false)
  const accountName = useAccounts().find((a) => a.profileId === workspace.profileId)?.name ?? workspace.profileId
  const guarded = (kind: CleanupKind, projects: CleanupProject[]) => () => {
    menu.close()
    if (useContextStore.getState().confirmLeave()) startCleanup(workspace, report, accountName, kind, projects)
  }
  const pickProjects = (): void => {
    menu.close()
    setPicking(true)
  }
  return (
    <>
      <span ref={menu.setAnchor} className="ml-auto inline-flex">
        <Button variant="ghost" pressed={menu.open} onClick={menu.toggle} tooltip="Start a session that checks these files against the code">
          Clean up
          <ChevronDown size={12} aria-hidden />
        </Button>
      </span>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" label="Clean up">
        <PopoverMenu label="Clean up">
          <MenuItem
            icon={FolderGit2}
            label="This project"
            description="memory, CLAUDE.md files, repo skills, agents and commands"
            onClick={guarded('project', [{ name: workspace.name, report }])}
          />
          <MenuItem icon={UserRound} label="Account" description="the account's CLAUDE.md, skills, agents, commands and settings" onClick={guarded('account', [])} />
          <MenuItem icon={FolderTree} label="Across projects…" description="pick the account's workspaces; the account files come along" onClick={pickProjects} />
        </PopoverMenu>
      </Popover>
      {picking && (
        <CrossProjectCleanupDialog
          workspace={workspace}
          accountName={accountName}
          onStart={(projects) => {
            setPicking(false)
            startCleanup(workspace, report, accountName, 'cross-project', projects)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}

function LayerPanel({ title, items, defaultName }: { title: string; items: ContextItem[]; defaultName: string }) {
  return (
    <Panel title={title} count={items.length} empty="Nothing here.">
      {groupByKind(items).map((group) => (
        <KindGroupSection key={group.group} group={group} defaultName={defaultName} />
      ))}
    </Panel>
  )
}

function KindGroupSection({ group, defaultName }: { group: KindGroup; defaultName: string }) {
  const [open, setOpen] = useState(() => !(FOLD_WHEN_LONG.has(group.group) && group.count > LONG_GROUP))
  const Icon = GROUP_ICONS[group.group]
  return (
    <CollapsibleSection
      level="group"
      title={KIND_GROUP_TITLES[group.group]}
      open={open}
      onToggle={() => setOpen(!open)}
      marker={<Icon size={14} aria-hidden className="shrink-0" />}
      badge={
        <ListRowMeta>
          {group.count}
          {group.tokens !== null && ` · ${formatTokens(group.tokens)}`}
        </ListRowMeta>
      }
    >
      <ItemList items={group.items} defaultName={defaultName} nested />
    </CollapsibleSection>
  )
}

function ItemList({ items, defaultName, nested = false }: { items: ContextItem[]; defaultName: string; nested?: boolean }) {
  return (
    <ul>
      {items.map((item, n) => (
        <ContextRow key={`${n}:${item.kind}:${item.path ?? item.label}`} item={item} defaultName={defaultName} nested={nested} />
      ))}
    </ul>
  )
}

function ContextRow({ item, defaultName, nested }: { item: ContextItem; defaultName: string; nested: boolean }) {
  const openPath = useContextStore((s) => s.editor?.path ?? null)
  const path = item.missing ? null : item.path
  const body = (
    <>
      {item.kind === 'hook' && <ListRowLabel tone="secondary">hook</ListRowLabel>}
      <ListRowLabel tooltip={item.path ?? undefined}>{item.label}</ListRowLabel>
      {item.note && <ListRowNote>{item.note}</ListRowNote>}
      {item.source.startsWith('plugin:') && <ListRowMeta>{item.source}</ListRowMeta>}
      {item.source === 'project-entry' && <ListRowMeta>workspace entry</ListRowMeta>}
      {item.tokens !== null && <ListRowMeta>{formatTokens(item.tokens)}</ListRowMeta>}
      {item.kind === 'mcp-server' && <Badge tone="quiet">tools not counted</Badge>}
      {item.missing && <Badge tone="quiet-warning">not found</Badge>}
      {item.sharedWithDefault && <Badge tone="quiet">shared with {defaultName}</Badge>}
      {item.readOnly && (
        <Badge tone="quiet" tooltip={item.readOnly}>
          read-only
        </Badge>
      )}
    </>
  )
  const open = (file: string): void =>
    useContextStore.getState().open({ path: file, label: item.label, sharedWithDefault: item.sharedWithDefault, readOnly: item.readOnly, creating: false })
  return (
    <>
      {path ? (
        <ListRow nested={nested} active={openPath === path} tooltip={path} onClick={() => open(path)}>
          {body}
        </ListRow>
      ) : (
        <ListItem nested={nested} alignWithRows>
          {body}
        </ListItem>
      )}
      {item.children.length > 0 && (
        <li className="pl-4">
          <ItemList items={item.children} defaultName={defaultName} nested={nested} />
        </li>
      )}
    </>
  )
}
