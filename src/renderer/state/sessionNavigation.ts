import { create } from 'zustand'
import type { LocalSessionInfo, Workspace } from '../../shared/types'
import { closeHalf, dropChats, focusHalf, openChat, replaceChat, splitPair, type ChatPair, type ChatRef, type HalfIndex } from './chatPair'
import { useChatPairStore } from './chatPairStore'
import { useChatItemsStore } from './chatItemsStore'
import type { ChatItem } from '../components/chat/types'
import { chatOnScreen, type ShellOptions } from './projectViewLayout'
import { useProjectViewsStore, type ProjectView, type ShellTab } from './projectViewsStore'
import { useViewStore } from './viewStore'
import { useObservedStore } from './observedStore'
import { useRecentProjectsStore } from './recentProjectsStore'
import { saveDraft } from './restoreStore'

export const NEXT_WAITING_SHORTCUT = 'Ctrl+Shift+J'

export interface HostedSessionRef {
  paneId: string
  projectId: string
  title: string
}

export function hostedSessions(views: Record<string, ProjectView>): HostedSessionRef[] {
  return Object.values(views).flatMap((v) =>
    v.claudeSessions.map((c) => ({ paneId: c.id, projectId: v.projectId, title: c.title }))
  )
}

export type OpenTarget =
  | { kind: 'hosted'; workspaceId: string; paneId: string }
  | { kind: 'observed'; workspaceId: string; sessionId: string }
  | null

export function resolveChat(ref: ChatRef | null | undefined, views: Record<string, ProjectView>): OpenTarget {
  if (!ref) return null
  if (ref.kind === 'observed') return ref
  const found = hostedSessions(views).find((s) => s.paneId === ref.paneId)
  return found ? { kind: 'hosted', workspaceId: found.projectId, paneId: ref.paneId } : null
}

const currentPair = (): ChatPair => useChatPairStore.getState().pair

export function focusedTarget(): OpenTarget {
  const pair = currentPair()
  return resolveChat(pair.halves[pair.focused], useProjectViewsStore.getState().views)
}

/** The hosted chat in the focused half, while Work shows it. */
export function paneOnScreen(): string | null {
  const screen = useViewStore.getState()
  if (screen.view !== 'work' || screen.settings !== null) return null
  const target = focusedTarget()
  if (target?.kind !== 'hosted') return null
  const view = useProjectViewsStore.getState().views[target.workspaceId]
  return view && chatOnScreen(view) ? target.paneId : null
}

/** The IDE panels and shells follow the focused half; the observed transcript follows whichever half shows one. */
function syncScreen(pair: ChatPair): void {
  const views = useProjectViewsStore.getState()
  const focused = resolveChat(pair.halves[pair.focused], views.views)
  if (focused && views.views[focused.workspaceId]) {
    views.setActive(focused.workspaceId)
    if (focused.kind === 'hosted') views.setActiveClaudeSession(focused.workspaceId, focused.paneId)
  }
  const following = pair.halves.find((h) => h?.kind === 'observed')
  const observed = useObservedStore.getState()
  if (following?.kind !== 'observed') {
    observed.close()
    return
  }
  const v = observed.viewing
  if (v?.workspaceId !== following.workspaceId || v.sessionId !== following.sessionId) {
    void observed.open(following.workspaceId, following.sessionId)
  }
}

function showPair(next: ChatPair): void {
  const store = useChatPairStore.getState()
  if (next !== store.pair) store.setPair(next)
  syncScreen(next)
}

export function focusChatHalf(half: HalfIndex): void {
  const pair = currentPair()
  if (half !== pair.focused) showPair(focusHalf(pair, half))
}

export function splitChat(): void {
  showPair(splitPair(currentPair()))
}

/** Takes a chat off screen; its session keeps running. */
export function closeChatHalf(half: HalfIndex): void {
  showPair(closeHalf(currentPair(), half))
}

interface FocusRequestState {
  request: { paneId: string; nonce: number } | null
  requestFocus: (paneId: string) => void
  clear: () => void
}

/** Asks a chat to focus its approval prompt, or its input when nothing awaits approval. */
export const useFocusRequestStore = create<FocusRequestState>((set, get) => ({
  request: null,
  requestFocus: (paneId) => set({ request: { paneId, nonce: (get().request?.nonce ?? 0) + 1 } }),
  clear: () => set({ request: null })
}))

export interface OpenOptions {
  /** false leaves keyboard focus where it is. */
  focus?: boolean
  /** Opens beside the focused chat instead of in its place. */
  beside?: boolean
}

/** Brings a hosted session's chat on screen in Work, in the focused half unless `beside`. */
export function openSession(paneId: string, { focus = true, beside = false }: OpenOptions = {}): boolean {
  const views = useProjectViewsStore.getState()
  const target = hostedSessions(views.views).find((s) => s.paneId === paneId)
  if (!target) return false
  useViewStore.getState().setView('work')
  views.setCenterView(target.projectId, 'chat')
  showPair(openChat(currentPair(), { kind: 'hosted', paneId }, { beside }))
  if (focus) useFocusRequestStore.getState().requestFocus(paneId)
  return true
}

export function openObserved(workspaceId: string, sessionId: string, { beside = false }: Pick<OpenOptions, 'beside'> = {}): void {
  useViewStore.getState().setView('work')
  showPair(openChat(currentPair(), { kind: 'observed', workspaceId, sessionId }, { beside }))
}

/** Brings a hosted chat on screen in the half that showed `from`, else in the focused half. */
export function openSessionInPlaceOf(from: ChatRef, paneId: string): void {
  const views = useProjectViewsStore.getState()
  const target = hostedSessions(views.views).find((s) => s.paneId === paneId)
  if (!target) return
  useViewStore.getState().setView('work')
  views.setCenterView(target.projectId, 'chat')
  showPair(replaceChat(currentPair(), from, { kind: 'hosted', paneId }))
  useFocusRequestStore.getState().requestFocus(paneId)
}

export interface StartOptions {
  /** Waits in the new chat's input; never sent by itself. */
  draft?: string
  /** Folders outside the workspace the session may read without asking. */
  addDirs?: string[]
}

/** Opens a new chat in the workspace, on its account profile. */
export function startSession(workspace: Workspace, { draft, addDirs }: StartOptions = {}): boolean {
  useRecentProjectsStore.getState().touch(workspace.id)
  const views = useProjectViewsStore.getState()
  const prepared = draft !== undefined || addDirs !== undefined
  if (!views.views[workspace.id]) {
    views.openProject(workspace, { firstSession: !prepared })
    if (!prepared) {
      const first = useProjectViewsStore.getState().views[workspace.id]?.claudeSessions[0]
      return first ? openSession(first.id) : false
    }
  }
  const created = useProjectViewsStore.getState().addClaudeSession(workspace.id, { addDirs })
  if (!created) return false
  // The input box reads its draft once, as the chat mounts.
  if (draft !== undefined) saveDraft(created.id, draft)
  return openSession(created.id)
}

/** Resumes a past session of the workspace as a new chat, showing its transcript so far. */
export async function resumeSession(workspace: Workspace, info: LocalSessionInfo): Promise<boolean> {
  useRecentProjectsStore.getState().touch(workspace.id)
  // Read before the chat mounts: it decides its paused banner from the items it starts with.
  const read = await window.api.observed.read(workspace.id, info.sessionId)
  const views = useProjectViewsStore.getState()
  if (!views.views[workspace.id]) views.openProject(workspace, { firstSession: false })
  const loaded = useProjectViewsStore.getState().loadSessionFromLocal(workspace.id, info)
  if (!loaded) return false
  const history: ChatItem[] = read.ok
    ? read.items
    : [{ kind: 'system', id: crypto.randomUUID(), text: `Could not read this session's transcript (${read.error}); Claude still has the whole conversation.`, at: Date.now() }]
  useChatItemsStore.getState().appendItems(loaded.id, history)
  return openSession(loaded.id)
}

/** Stops the session's process and removes it from Work; its transcript stays resumable from Past sessions. */
export function closeSession(paneId: string): void {
  const target = hostedSessions(useProjectViewsStore.getState().views).find((s) => s.paneId === paneId)
  if (target) useProjectViewsStore.getState().closeClaudeSession(target.projectId, paneId)
}

/** Switches to Work on the workspace's current session, starting one when it has none. */
export function openWorkspace(workspace: Workspace): void {
  const view = useProjectViewsStore.getState().views[workspace.id]
  const paneId = view?.activeClaudeSessionId ?? view?.claudeSessions.at(-1)?.id
  if (!paneId || !openSession(paneId, { focus: false })) startSession(workspace)
}

/** Opens a new shell in the workspace's shell drawer, bringing the workspace on screen first. */
export function openShell(
  workspace: Workspace,
  options?: ShellOptions
): ShellTab | null {
  openWorkspace(workspace)
  return useProjectViewsStore.getState().openShell(workspace.id, options)
}

function hostedExists(ref: ChatRef): boolean {
  return ref.kind === 'observed' || hostedSessions(useProjectViewsStore.getState().views).some((s) => s.paneId === ref.paneId)
}

let pairInitialised = false

/** Restores the saved pair, dropping chats that no longer exist, and keeps it in step with closed sessions. */
export function initChatPair(): void {
  if (pairInitialised) return
  pairInitialised = true
  let restored = dropChats(currentPair(), hostedExists)
  if (restored.halves.every((h) => h === null)) {
    const { activeProjectId, views } = useProjectViewsStore.getState()
    const paneId = activeProjectId ? views[activeProjectId]?.activeClaudeSessionId : null
    if (paneId) restored = openChat(restored, { kind: 'hosted', paneId })
  }
  showPair(restored)
  useProjectViewsStore.subscribe((s, prev) => {
    if (s.views === prev.views) return
    const next = dropChats(currentPair(), hostedExists)
    if (next !== currentPair()) showPair(next)
  })
}
