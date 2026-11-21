import { useMemo } from 'react'
import { create } from 'zustand'
import type { CliModel, ModelDefaults, SessionInit, SessionStatusEntry } from '../../shared/types'
import { currentChoice, paneModels, sessionTag } from './modelPicker'
import { useModelStore, type AppliedModel } from './modelStore'
import { useSessionInitStore } from './sessionInitStore'
import { useObservedStore } from './observedStore'
import { useProjectViewsStore, type ClaudeChatSession, type ProjectView } from './projectViewsStore'
import { useRepoIdentitiesStore } from './repoIdentitiesStore'
import { halfShowing, type ChatPair, type ChatRef, type HalfIndex } from './chatPair'
import { useChatPairStore } from './chatPairStore'
import { openObserved, openSession, resolveChat, type OpenOptions, type OpenTarget } from './sessionNavigation'
import { sessionList, type HostedSessionInput, type SessionGroup, type SessionListInput, type SessionRow } from './sessionList'
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

interface ModelSources {
  inits: Record<string, SessionInit>
  cachedModels: CliModel[]
  defaults: ModelDefaults
  applied: Record<string, AppliedModel>
}

/** None until there is a model list or a pick to name. */
function modelTagOf(c: ClaudeChatSession, m: ModelSources): string | undefined {
  const models = paneModels(m.inits[c.id]?.models, m.cachedModels)
  const choice = currentChoice({ models, defaults: m.defaults, session: c, applied: m.applied[c.id] })
  if (models.length === 0 && choice.selection === undefined) return undefined
  return sessionTag(choice.pill)
}

/** A hosted session's most recent activity is when its status last changed. */
function hostedInputs(
  views: Record<string, ProjectView>,
  byPane: Record<string, SessionStatusEntry>,
  models: ModelSources
): HostedSessionInput[] {
  return Object.values(views).flatMap((v) =>
    v.claudeSessions.map((c) => ({
      paneId: c.id,
      workspaceId: v.projectId,
      title: c.title,
      lastActivityAt: byPane[c.id]?.since ?? 0,
      modelTag: modelTagOf(c, models)
    }))
  )
}

interface ListSources extends Omit<SessionListInput, 'hosted' | 'statuses'> {
  views: Record<string, ProjectView>
  byPane: Record<string, SessionStatusEntry>
  models: ModelSources
}

function listInput({ views, byPane, models, ...rest }: ListSources): SessionListInput {
  return { hosted: hostedInputs(views, byPane, models), statuses: Object.values(byPane), ...rest }
}

function currentModelSources(): ModelSources {
  const { cachedModels, defaults, applied } = useModelStore.getState()
  return { inits: useSessionInitStore.getState().byPane, cachedModels, defaults, applied }
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
  return useMemo(
    () =>
      listInput({
        views,
        byPane,
        models: { inits, cachedModels, defaults, applied },
        observed,
        workspaces,
        identities,
        search: ''
      }),
    [views, byPane, inits, cachedModels, defaults, applied, observed, workspaces, identities]
  )
}

export function useSessionGroups(): SessionGroup[] {
  const sources = useSessionSources()
  const search = useWorkSearchStore((s) => s.search)
  return useMemo(() => sessionList({ ...sources, search }), [sources, search])
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
  if (row.kind === 'hosted') openSession(row.paneId, options)
  else openObserved(row.workspace.id, row.sessionId, options)
}

/** Opens the list's nth row as it is shown, search applied. */
export function openRowAt(index: number): void {
  const row = sessionList(listInput(currentSources())).flatMap((g) => g.rows)[index]
  if (row) openRow(row)
}
