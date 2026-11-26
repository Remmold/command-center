import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { CliModel, ModelDefaults, SessionInit, SessionStatusEntry, Workspace } from '../../shared/types'
import { currentChoice, sessionTag } from './modelPicker'
import { defaultsOf, useModelStore, type AppliedModel } from './modelStore'
import { useSessionInitStore } from './sessionInitStore'
import { useObservedStore } from './observedStore'
import { useProjectViewsStore, type ClaudeChatSession, type ProjectView } from './projectViewsStore'
import { useRepoIdentitiesStore } from './repoIdentitiesStore'
import { halfShowing, type ChatPair, type ChatRef, type HalfIndex } from './chatPair'
import { useChatPairStore } from './chatPairStore'
import { openObserved, openWhereShown, openSession, paneOnScreen, resolveChat, type OpenOptions, type OpenTarget } from './sessionNavigation'
import {
  accountChats,
  accountSections,
  listFold,
  seedSource,
  sessionList,
  shownRows,
  nextWaitingRow,
  waitingRows,
  type AccountSection,
  isNeedsYouRow,
  type HostedRow,
  type HostedSessionInput,
  type ListFold,
  type SessionGroup,
  type SessionListInput,
  type SessionRow
} from './sessionList'
import { dayNumber, type SidebarLayout } from '../../shared/sidebarGroups'
import { groupOf, hostOf, placeChats, seedLayout, setFolded } from './sidebarGroups'
import { useSidebarGroupsStore } from './sidebarGroupsStore'
import { useProfilesStore } from './profilesStore'
import { accountOf, type Account } from './accounts'
import type { ChatProcess } from './chatAccount'
import { currentAccounts, useAccounts } from './useAccounts'
import { useSessionStatusStore } from './sessionStatusStore'
import { useWorkspacesStore } from './workspacesStore'
import { featurePanes, useFeaturesStore } from './featuresStore'

interface WorkSearchState {
  search: string
  setSearch: (search: string) => void
}

export const useWorkSearchStore = create<WorkSearchState>((set) => ({
  search: '',
  setSearch: (search) => set({ search })
}))

interface AccountSectionsState {
  /** Profile ids of the account sections folded shut. */
  collapsed: string[]
  /** Repo groups folded shut before own groups, by `repoFoldKey`; read once, to seed their folds. */
  collapsedRepos: string[]
  toggle: (profileId: string) => void
  expand: (profileId: string) => void
}

const toggled = (list: string[], id: string) => (list.includes(id) ? list.filter((c) => c !== id) : [...list, id])

export const useAccountSectionsStore = create<AccountSectionsState>()(
  persist(
    (set) => ({
      collapsed: [],
      collapsedRepos: [],
      toggle: (id) => set((s) => ({ collapsed: toggled(s.collapsed, id) })),
      expand: (id) => set((s) => (s.collapsed.includes(id) ? { collapsed: toggled(s.collapsed, id) } : s))
    }),
    {
      name: 'command-center.work-accounts',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ collapsed: s.collapsed, collapsedRepos: s.collapsedRepos })
    }
  )
)

interface ModelSources {
  inits: Record<string, SessionInit>
  cachedModels: CliModel[]
  settingsByProfile: Record<string, ModelDefaults>
  applied: Record<string, AppliedModel>
  defaultByProfile: Record<string, string>
  processes: Record<string, ChatProcess>
}

/** None until there is a model list or a pick to name. */
function modelTagOf(c: ClaudeChatSession, profileId: string | undefined, m: ModelSources): string | undefined {
  const runsOn = m.processes[c.id]?.profileId ?? profileId
  const choice = currentChoice({
    own: m.inits[c.id]?.models,
    cachedModels: m.cachedModels,
    knownDefault: runsOn ? m.defaultByProfile[runsOn] : undefined,
    defaults: defaultsOf(m.settingsByProfile, runsOn),
    session: c,
    applied: m.applied[c.id]
  })
  if (choice.models.length === 0 && choice.selection === undefined) return undefined
  return sessionTag(choice.pill)
}

/** A hosted session's most recent activity is when its status last changed. */
function hostedInputs(
  views: Record<string, ProjectView>,
  byPane: Record<string, SessionStatusEntry>,
  models: ModelSources,
  workspaces: readonly Workspace[],
  features: ReadonlySet<string>
): HostedSessionInput[] {
  return Object.values(views).flatMap((v) => {
    const profileId = workspaces.find((w) => w.id === v.projectId)?.profileId
    return v.claudeSessions.filter((c) => !features.has(c.id)).map((c) => ({
      paneId: c.id,
      workspaceId: v.projectId,
      title: c.title,
      lastActivityAt: byPane[c.id]?.since ?? 0,
      modelTag: modelTagOf(c, profileId, models),
      claudeSessionId: c.claudeSessionId
    }))
  })
}

const NO_PANES: ReadonlySet<string> = new Set()

interface ListSources extends Omit<SessionListInput, 'hosted' | 'statuses'> {
  views: Record<string, ProjectView>
  byPane: Record<string, SessionStatusEntry>
  models: ModelSources
  /** Feature sessions, which the Features group shows instead. */
  features: ReadonlySet<string>
}

function listInput({ views, byPane, models, features, ...rest }: ListSources): SessionListInput {
  return { hosted: hostedInputs(views, byPane, models, rest.workspaces, features), statuses: Object.values(byPane), ...rest }
}

function currentModelSources(): ModelSources {
  const { cachedModels, settingsByProfile, applied, defaultByProfile } = useModelStore.getState()
  const { byPane: inits, processByPane: processes } = useSessionInitStore.getState()
  return { inits, cachedModels, settingsByProfile, applied, defaultByProfile, processes }
}

function currentSources(): ListSources {
  return {
    views: useProjectViewsStore.getState().views,
    models: currentModelSources(),
    features: featurePanes(useFeaturesStore.getState().features),
    byPane: useSessionStatusStore.getState().byPane,
    observed: useObservedStore.getState().sessions,
    workspaces: useWorkspacesStore.getState().workspaces,
    identities: useRepoIdentitiesStore.getState().identities,
    search: useWorkSearchStore.getState().search
  }
}

/** Every session the list is built from, unfiltered; `withFeatures` adds feature sessions, which the Needs you queue counts. */
export function useSessionSources(withFeatures = false): Omit<SessionListInput, 'search'> {
  const views = useProjectViewsStore((s) => s.views)
  const byPane = useSessionStatusStore((s) => s.byPane)
  const observed = useObservedStore((s) => s.sessions)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const inits = useSessionInitStore((s) => s.byPane)
  const cachedModels = useModelStore((s) => s.cachedModels)
  const settingsByProfile = useModelStore((s) => s.settingsByProfile)
  const applied = useModelStore((s) => s.applied)
  const defaultByProfile = useModelStore((s) => s.defaultByProfile)
  const processes = useSessionInitStore((s) => s.processByPane)
  const featureList = useFeaturesStore((s) => s.features)
  return useMemo(
    () =>
      listInput({
        views,
        byPane,
        models: { inits, cachedModels, settingsByProfile, applied, defaultByProfile, processes },
        features: withFeatures ? NO_PANES : featurePanes(featureList),
        observed,
        workspaces,
        identities,
        search: ''
      }),
    [views, byPane, inits, cachedModels, settingsByProfile, applied, defaultByProfile, processes, featureList, withFeatures, observed, workspaces, identities]
  )
}

export interface SessionSections {
  sections: AccountSection[]
  /** False with a single account: the list then shows its groups without an account header. */
  headed: boolean
  /** The saved groups are still being read; the list shows nothing yet. */
  loading: boolean
  /** The layout the sections show; null while loading. */
  layout: SidebarLayout | null
}

/** The layout the list shows: the saved one (or, before any is saved, one seeded from the repo groups) with every chat placed. */
function layoutFor(
  saved: SidebarLayout | null | undefined,
  all: readonly SessionGroup[],
  accounts: readonly Account[],
  workspaces: readonly Workspace[],
  foldedRepos: readonly string[]
): SidebarLayout | null {
  if (saved === undefined) return null
  const today = dayNumber(Date.now())
  const base = saved ?? seedLayout(seedSource(all, accounts, workspaces, foldedRepos), today)
  return placeChats(base, accountChats(all, accounts), today)
}

function sectionsOf(
  all: SessionGroup[],
  sources: Omit<SessionListInput, 'search'>,
  search: string,
  accounts: readonly Account[],
  layout: SidebarLayout | null
): SessionSections {
  const headed = accounts.length > 1
  if (!layout) return { sections: [], headed, loading: true, layout }
  const searching = search.trim() !== ''
  const groups = searching ? sessionList({ ...sources, search }) : all
  return { sections: accountSections(groups, accounts, layout, searching), headed, loading: false, layout }
}

export function useSessionSections(): SessionSections {
  const sources = useSessionSources()
  const search = useWorkSearchStore((s) => s.search)
  const accounts = useAccounts()
  const saved = useSidebarGroupsStore((s) => s.saved)
  const foldedRepos = useAccountSectionsStore((s) => s.collapsedRepos)
  const workspacesLoaded = useWorkspacesStore((s) => s.loaded)
  const profilesLoaded = useProfilesStore((s) => s.loaded)
  const observedListed = useObservedStore((s) => s.listed)
  const ready = workspacesLoaded && profilesLoaded && observedListed
  const all = useMemo(() => sessionList({ ...sources, search: '' }), [sources])
  const layout = useMemo(
    () => layoutFor(saved, all, accounts, sources.workspaces, foldedRepos),
    [saved, all, accounts, sources.workspaces, foldedRepos]
  )
  useEffect(() => {
    if (ready && layout && layout !== saved) useSidebarGroupsStore.getState().commit(layout)
  }, [layout, saved, ready])
  return useMemo(() => sectionsOf(all, sources, search, accounts, layout), [all, sources, search, accounts, layout])
}

/**
 * Nothing is saved until workspaces, accounts and VS Code chats have loaded: before that a chat can be missing (and
 * land in Ungrouped when it arrives) or sit under the wrong account.
 */
function layoutReady(): boolean {
  return useWorkspacesStore.getState().loaded && useProfilesStore.getState().loaded && useObservedStore.getState().listed
}

function currentLayout(): SidebarLayout | null {
  const { search: _search, ...sources } = listInput(currentSources())
  return layoutFor(
    useSidebarGroupsStore.getState().saved,
    sessionList({ ...sources, search: '' }),
    currentAccounts(),
    sources.workspaces,
    useAccountSectionsStore.getState().collapsedRepos
  )
}

/** Applies a change to the groups as shown and saves it; a change that refuses (a drop on another account) saves nothing. */
export function changeLayout(change: (layout: SidebarLayout) => SidebarLayout): void {
  const layout = currentLayout()
  if (!layout || !layoutReady()) return
  const next = change(layout)
  if (next !== layout) useSidebarGroupsStore.getState().commit(next)
}

/** The account section a row sits in: where it is placed, else its own account. */
function rowSection(row: SessionRow): string {
  const layout = currentLayout()
  const live = currentAccounts()
  const host = layout && hostOf(layout, row.placeId)
  return host && live.some((a) => a.profileId === host) ? host : accountOf(live, row.workspace.profileId).profileId
}

export interface ShownChats {
  halves: OpenTarget[]
  focused: HalfIndex
}

/** What each half of the chat area shows; one entry unless split. */
export function useShownChats(): ShownChats {
  const pair = useChatPairStore((s) => s.pair)
  const views = useProjectViewsStore((s) => s.views)
  return useMemo(() => ({ halves: pair.halves.map((h) => resolveChat(h, views)), focused: pair.focused }), [pair, views])
}

export function rowChat(row: SessionRow): ChatRef {
  return row.kind === 'hosted'
    ? { kind: 'hosted', paneId: row.paneId }
    : { kind: 'observed', workspaceId: row.workspace.id, sessionId: row.sessionId }
}

export function isShown(row: SessionRow, pair: ChatPair): boolean {
  return halfShowing(pair, rowChat(row)) !== null
}

export function openRow(row: SessionRow, options?: OpenOptions): void {
  const profileId = rowSection(row)
  useAccountSectionsStore.getState().expand(profileId)
  changeLayout((layout) => {
    const group = groupOf(layout, profileId, row.placeId)
    return group ? setFolded(layout, profileId, group, false) : layout
  })
  if (row.kind === 'hosted') openSession(row.paneId, options)
  else openObserved(row.workspace.id, row.sessionId, options)
}

function currentSections(applySearch: boolean): SessionSections {
  const { search, ...sources } = listInput(currentSources())
  const all = sessionList({ ...sources, search: '' })
  return sectionsOf(all, sources, applySearch ? search : '', currentAccounts(), currentLayout())
}

/** The saved folds as the list applies them. */
export function useListFold(headed: boolean): ListFold {
  const accounts = useAccountSectionsStore((s) => s.collapsed)
  const search = useWorkSearchStore((s) => s.search)
  return useMemo(() => listFold(accounts, { search, headed }), [accounts, search, headed])
}

/** Opens the list's nth row as it is shown: search applied, folded sections and groups skipped. */
export function openRowAt(index: number): void {
  const { sections, headed } = currentSections(true)
  const fold = listFold(useAccountSectionsStore.getState().collapsed, { search: useWorkSearchStore.getState().search, headed })
  const row = shownRows(sections, fold)[index]
  if (row) openRow(row)
}

/** Waiting feature sessions, which the list's own sections leave out; the Features group shows them first. */
function waitingFeatureRows(): HostedRow[] {
  const panes = featurePanes(useFeaturesStore.getState().features)
  const { search: _search, ...sources } = listInput({ ...currentSources(), features: NO_PANES })
  return sessionList({ ...sources, search: '' })
    .flatMap((g) => g.rows)
    .filter((r): r is HostedRow => isNeedsYouRow(r) && panes.has(r.paneId))
}

/** The waiting session after the one on screen, in the order the list shows them (features first); a search never hides one. */
export function jumpToNextWaiting(): void {
  const { sections } = currentSections(false)
  const features = waitingFeatureRows()
  const panes = new Set(features.map((r) => r.paneId))
  const row = nextWaitingRow([...features, ...waitingRows(sections)], paneOnScreen())
  if (row)
    openWhereShown(row.paneId, () => {
      if (panes.has(row.paneId)) return openSession(row.paneId)
      openRow(row)
      return true
    })
}
