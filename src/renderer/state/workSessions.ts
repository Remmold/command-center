import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { nextWaiting } from '../../shared/needsYou'
import type { CliModel, ModelDefaults, SessionInit, SessionStatusEntry, Workspace } from '../../shared/types'
import { currentChoice, sessionTag } from './modelPicker'
import { useModelStore, type AppliedModel } from './modelStore'
import { useSessionInitStore } from './sessionInitStore'
import { useObservedStore } from './observedStore'
import { useProjectViewsStore, type ClaudeChatSession, type ProjectView } from './projectViewsStore'
import { useRepoIdentitiesStore } from './repoIdentitiesStore'
import { halfShowing, type ChatPair, type ChatRef, type HalfIndex } from './chatPair'
import { useChatPairStore } from './chatPairStore'
import { openObserved, openSession, paneOnScreen, resolveChat, type OpenOptions, type OpenTarget } from './sessionNavigation'
import {
  accountSections,
  sessionList,
  shownRows,
  waitingRows,
  type AccountSection,
  type HostedSessionInput,
  type SessionListInput,
  type SessionRow
} from './sessionList'
import { accountOf, type Account } from './accounts'
import type { ChatProcess } from './chatAccount'
import { currentAccounts, useAccounts } from './useAccounts'
import { useSessionStatusStore } from './sessionStatusStore'
import { useWorkspacesStore } from './workspacesStore'

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
  toggle: (profileId: string) => void
  expand: (profileId: string) => void
}

export const useAccountSectionsStore = create<AccountSectionsState>()(
  persist(
    (set) => ({
      collapsed: [],
      toggle: (id) => set((s) => ({ collapsed: s.collapsed.includes(id) ? s.collapsed.filter((c) => c !== id) : [...s.collapsed, id] })),
      expand: (id) => set((s) => (s.collapsed.includes(id) ? { collapsed: s.collapsed.filter((c) => c !== id) } : s))
    }),
    {
      name: 'command-center.work-accounts',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ collapsed: s.collapsed })
    }
  )
)

interface ModelSources {
  inits: Record<string, SessionInit>
  cachedModels: CliModel[]
  defaults: ModelDefaults
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
    defaults: m.defaults,
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
  workspaces: readonly Workspace[]
): HostedSessionInput[] {
  return Object.values(views).flatMap((v) => {
    const profileId = workspaces.find((w) => w.id === v.projectId)?.profileId
    return v.claudeSessions.map((c) => ({
      paneId: c.id,
      workspaceId: v.projectId,
      title: c.title,
      lastActivityAt: byPane[c.id]?.since ?? 0,
      modelTag: modelTagOf(c, profileId, models)
    }))
  })
}

interface ListSources extends Omit<SessionListInput, 'hosted' | 'statuses'> {
  views: Record<string, ProjectView>
  byPane: Record<string, SessionStatusEntry>
  models: ModelSources
}

function listInput({ views, byPane, models, ...rest }: ListSources): SessionListInput {
  return { hosted: hostedInputs(views, byPane, models, rest.workspaces), statuses: Object.values(byPane), ...rest }
}

function currentModelSources(): ModelSources {
  const { cachedModels, defaults, applied, defaultByProfile } = useModelStore.getState()
  const { byPane: inits, processByPane: processes } = useSessionInitStore.getState()
  return { inits, cachedModels, defaults, applied, defaultByProfile, processes }
}

function currentSources(): ListSources {
  return {
    views: useProjectViewsStore.getState().views,
    models: currentModelSources(),
    byPane: useSessionStatusStore.getState().byPane,
    observed: useObservedStore.getState().sessions,
    workspaces: useWorkspacesStore.getState().workspaces,
    identities: useRepoIdentitiesStore.getState().identities,
    search: useWorkSearchStore.getState().search
  }
}

/** Every session the list is built from, unfiltered. */
export function useSessionSources(): Omit<SessionListInput, 'search'> {
  const views = useProjectViewsStore((s) => s.views)
  const byPane = useSessionStatusStore((s) => s.byPane)
  const observed = useObservedStore((s) => s.sessions)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const inits = useSessionInitStore((s) => s.byPane)
  const cachedModels = useModelStore((s) => s.cachedModels)
  const defaults = useModelStore((s) => s.defaults)
  const applied = useModelStore((s) => s.applied)
  const defaultByProfile = useModelStore((s) => s.defaultByProfile)
  const processes = useSessionInitStore((s) => s.processByPane)
  return useMemo(
    () =>
      listInput({
        views,
        byPane,
        models: { inits, cachedModels, defaults, applied, defaultByProfile, processes },
        observed,
        workspaces,
        identities,
        search: ''
      }),
    [views, byPane, inits, cachedModels, defaults, applied, defaultByProfile, processes, observed, workspaces, identities]
  )
}

export interface SessionSections {
  sections: AccountSection[]
  /** False with a single account: the list then shows its status groups without an account header. */
  headed: boolean
}

function sectionsOf(sources: Omit<SessionListInput, 'search'>, search: string, accounts: readonly Account[]): SessionSections {
  return { sections: accountSections(sessionList({ ...sources, search }), accounts), headed: accounts.length > 1 }
}

export function useSessionSections(): SessionSections {
  const sources = useSessionSources()
  const search = useWorkSearchStore((s) => s.search)
  const accounts = useAccounts()
  return useMemo(() => sectionsOf(sources, search, accounts), [sources, search, accounts])
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
  useAccountSectionsStore.getState().expand(accountOf(currentAccounts(), row.workspace.profileId).profileId)
  if (row.kind === 'hosted') openSession(row.paneId, options)
  else openObserved(row.workspace.id, row.sessionId, options)
}

function currentSections(applySearch: boolean): SessionSections {
  const { search, ...sources } = listInput(currentSources())
  return sectionsOf(sources, applySearch ? search : '', currentAccounts())
}

/** Opens the list's nth row as it is shown: search applied, collapsed sections skipped. */
export function openRowAt(index: number): void {
  const { sections, headed } = currentSections(true)
  const row = shownRows(sections, headed ? useAccountSectionsStore.getState().collapsed : [])[index]
  if (row) openRow(row)
}

/** The waiting session after the one on screen, in the order the list shows them; a search never hides one. */
export function jumpToNextWaiting(): void {
  const { sections } = currentSections(false)
  const rows = waitingRows(sections)
  const next = nextWaiting(
    rows.map((r) => ({ paneId: r.paneId, cwd: '', status: r.status, since: r.statusSince })),
    paneOnScreen()
  )
  const row = next && rows.find((r) => r.paneId === next.paneId)
  if (row) openRow(row)
}
