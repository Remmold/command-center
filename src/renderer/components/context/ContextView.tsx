import { useEffect, useMemo, useState } from 'react'
import { formatTokens, type ContextItem, type ContextItemKind, type ContextReport } from '../../../shared/context'
import { DEFAULT_PROFILE_ID, type Workspace } from '../../../shared/types'
import { workspacesByAccount, sectionTitle, type AccountWorkspaces } from '../../state/accounts'
import { useAccountColor } from '../../state/useAccountColor'
import { useAccounts } from '../../state/useAccounts'
import { useContextStore } from '../../state/contextStore'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { AccentDot } from '../ui/AccentDot'
import { Badge } from '../ui/Badge'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { EmptyState } from '../ui/EmptyState'
import { ListItem, ListRow, ListRowLabel, ListRowMeta, ListRowText } from '../ui/ListRow'
import { NoticeLine } from '../ui/NoticeLine'
import { Pane } from '../ui/Pane'
import { Panel } from '../ui/Panel'
import { ScrollStack } from '../ui/ScrollStack'
import { SidebarLayout } from '../ui/SidebarLayout'

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
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const selected = workspaces.find((w) => w.id === selectedId) ?? null
  return (
    <SidebarLayout sidebar={<WorkspaceList workspaces={workspaces} selectedId={selectedId} />}>
      {selected ? <Layers workspace={selected} report={report} /> : <EmptyState>{loaded ? 'Pick a workspace.' : 'No workspaces yet.'}</EmptyState>}
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

function Layers({ workspace, report }: { workspace: Workspace; report: ContextReport | null }) {
  const defaultName = useAccounts().find((a) => a.profileId === DEFAULT_PROFILE_ID)?.name ?? 'Personal'
  if (!report) return <EmptyState>Reading…</EmptyState>
  if (!report.folderExists) return <EmptyState>The folder {workspace.path} is gone, so nothing loads here.</EmptyState>
  const atStart = report.layers.repo.filter((i) => i.kind !== 'subfolder-claude-md')
  const subfolders = report.layers.repo.filter((i) => i.kind === 'subfolder-claude-md')
  return (
    <Pane label="Context layers">
      <NoticeLine strip>
        Start total {formatTokens(report.startTotal)} tokens · estimates, as configured
      </NoticeLine>
      <ScrollStack>
        <LayerPanel title="Account" items={report.layers.account} defaultName={defaultName} />
        <LayerPanel title="Repo" items={atStart} defaultName={defaultName} />
        <LayerPanel title="Local" items={report.layers.local} defaultName={defaultName} />
        {subfolders.length > 0 && <LayerPanel title="Loads when Claude works there" items={subfolders} defaultName={defaultName} />}
      </ScrollStack>
    </Pane>
  )
}

function LayerPanel({ title, items, defaultName }: { title: string; items: ContextItem[]; defaultName: string }) {
  return (
    <Panel title={title} count={items.length} empty="Nothing here.">
      <ItemList items={items} defaultName={defaultName} />
    </Panel>
  )
}

function ItemList({ items, defaultName }: { items: ContextItem[]; defaultName: string }) {
  return (
    <ul>
      {items.map((item) => (
        <ContextRow key={`${item.kind}:${item.path ?? item.label}`} item={item} defaultName={defaultName} />
      ))}
    </ul>
  )
}

/** The word shown before an item whose label alone doesn't say what it is. */
const KIND_WORDS: Partial<Record<ContextItemKind, string>> = {
  'memory-index': 'memory',
  'memory-file': 'memory',
  skill: 'skill',
  agent: 'agent',
  command: 'command',
  plugin: 'plugin'
}

function ContextRow({ item, defaultName }: { item: ContextItem; defaultName: string }) {
  const kindWord = KIND_WORDS[item.kind]
  return (
    <>
      <ListItem>
        {kindWord && <ListRowLabel tone="secondary">{kindWord}</ListRowLabel>}
        <ListRowLabel tooltip={item.path ?? undefined}>{item.label}</ListRowLabel>
        {item.source.startsWith('plugin:') && <ListRowMeta>{item.source}</ListRowMeta>}
        {item.tokens !== null && <ListRowMeta>{formatTokens(item.tokens)}</ListRowMeta>}
        {item.missing && <Badge tone="warning">not found</Badge>}
        {item.sharedWithDefault && <Badge>shared with {defaultName}</Badge>}
        {item.readOnly && <Badge tooltip={item.readOnly}>{item.readOnly}</Badge>}
      </ListItem>
      {item.children.length > 0 && (
        <li className="pl-4">
          <ItemList items={item.children} defaultName={defaultName} />
        </li>
      )}
    </>
  )
}
