import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { DEFAULT_PROFILE_ID, type PtyKind, type Workspace } from '../../shared/types'
import { useChatItemsStore } from './chatItemsStore'
import {
  LAYOUT_VERSION,
  migrateLayout,
  openShellTab,
  persistableView,
  toggleIdePanels,
  type ShellOptions
} from './projectViewLayout'
import { migratePermissionModes, unsetStoreDefault, type PermissionMode, type SavedModes } from './permissionModes'
import { migrateModelChoices, type SavedModelChoices } from './modelPicker'
import { startingChoiceOn } from './modelStore'
import { useWorkspacesStore } from './workspacesStore'
import { ATTACHED_MARKER } from '../components/chat/promptHistory'
import {
  NEW_SESSION_TITLE,
  migratedTitle,
  titleAfterClaude,
  titleAfterPrompt,
  titleAfterRename,
  type SessionTitle
} from './sessionTitle'
import type { LocalSessionInfo } from '../../shared/types'

export type ClaudeModel = 'sonnet' | 'opus' | 'haiku' | string

export interface ClaudeChatSession extends SessionTitle {
  id: string
  /** The session's own model pick; unset follows the user settings.json default. */
  model?: ClaudeModel
  /** The session's own effort pick; unset follows the saved or CLI default. */
  effort?: string
  thinking: boolean
  /** Unset until the session first starts: then the last pick, else the user settings' `permissions.defaultMode`. */
  permissionMode?: PermissionMode
  /** Folders outside the workspace it may read without asking, passed on every start; a cleanup session's. */
  addDirs?: string[]
  /** session_id reported by claude in stream-json events; used for --resume */
  claudeSessionId?: string
}

export interface ShellTab {
  id: string
  label: string
  kind: PtyKind
  env?: Record<string, string>
}

export interface OpenFile {
  path: string
  content: string
  dirty: boolean
  binary?: boolean
}

export type CenterView = 'chat' | 'file' | 'diff'

export type DiffKind = 'staged' | 'unstaged' | 'untracked'

export interface OpenDiff {
  id: string
  path: string
  kind: DiffKind
  diffText: string
  loading?: boolean
}

export interface ProjectView {
  projectId: string
  projectName: string
  projectPath: string
  claudeSessions: ClaudeChatSession[]
  activeClaudeSessionId: string | null
  shellTabs: ShellTab[]
  activeShellTabId: string | null
  openFiles: OpenFile[]
  activeFilePath: string | null
  openDiffs: OpenDiff[]
  activeDiffId: string | null
  centerView: CenterView
  idePanelsOpen: boolean
  shellDrawerOpen: boolean
}

export type ActivityView = 'explorer' | 'sourceControl' | null

interface ProjectViewsState {
  views: Record<string, ProjectView>
  order: string[]
  activeProjectId: string | null
  /** The mode the user last picked for new sessions; unset follows settings.json. */
  defaultPermissionMode?: PermissionMode
  /** Currently visible side activity (file tree etc.). null = nothing visible. */
  activityView: ActivityView
  setActivityView: (view: ActivityView) => void

  /** Without `firstSession: false` a new view starts with one fresh session. */
  openProject: (workspace: Workspace, options?: { firstSession?: boolean }) => void
  closeProject: (projectId: string) => void
  setActive: (projectId: string) => void

  toggleIdePanels: (projectId: string) => void
  toggleShellDrawer: (projectId: string) => void
  setShellDrawerOpen: (projectId: string, open: boolean) => void
  setDefaultPermissionMode: (mode: PermissionMode) => void

  addClaudeSession: (
    projectId: string,
    options?: { model?: ClaudeModel; permissionMode?: PermissionMode; addDirs?: string[] }
  ) => ClaudeChatSession | null
  closeClaudeSession: (projectId: string, sessionId: string) => void
  setActiveClaudeSession: (projectId: string, sessionId: string) => void
  setClaudeSessionId: (paneId: string, claudeSessionId: string) => void
  clearClaudeSessionId: (paneId: string) => void
  setSessionPermissionMode: (paneId: string, mode: PermissionMode) => void
  /** A new model drops the effort pick; the CLI applies the new model's own default. */
  setSessionModel: (paneId: string, model: ClaudeModel) => void
  setSessionEffort: (paneId: string, effort: string) => void
  setSessionThinking: (paneId: string, thinking: boolean) => void
  renameSession: (paneId: string, name: string) => void
  /** Names a session from its first prompt. */
  notePrompt: (paneId: string, text: string) => void
  /** Claude's `generate_session_title` result; a rename keeps winning. */
  applyClaudeTitle: (paneId: string, title: string) => void
  duplicateSession: (projectId: string, sessionId: string) => ClaudeChatSession | null
  loadSessionFromLocal: (projectId: string, info: LocalSessionInfo, model?: ClaudeModel) => ClaudeChatSession | null

  openShell: (projectId: string, options?: ShellOptions) => ShellTab | null
  addShellTab: (projectId: string, kind?: PtyKind) => ShellTab | null
  closeShellTab: (projectId: string, tabId: string) => void
  setActiveShellTab: (projectId: string, tabId: string) => void

  openFile: (projectId: string, file: OpenFile) => void
  closeFile: (projectId: string, path: string) => void
  setActiveFile: (projectId: string, path: string | null) => void
  updateFileContent: (projectId: string, path: string, content: string) => void
  markFileSaved: (projectId: string, path: string) => void
  setCenterView: (projectId: string, view: CenterView) => void

  openDiff: (
    projectId: string,
    info: { path: string; kind: DiffKind; diffText: string }
  ) => OpenDiff | null
  closeDiff: (projectId: string, diffId: string) => void
  setActiveDiff: (projectId: string, diffId: string | null) => void
  updateDiffText: (projectId: string, diffId: string, diffText: string) => void
}

function makeId(): string {
  return crypto.randomUUID()
}

export function findSessionByPane(state: ProjectViewsState, paneId: string): {
  projectId: string
  session: ClaudeChatSession
} | null {
  for (const projectId of Object.keys(state.views)) {
    const view = state.views[projectId]
    const session = view.claudeSessions.find((s) => s.id === paneId)
    if (session) return { projectId, session }
  }
  return null
}

type SetState = (fn: (s: ProjectViewsState) => Partial<ProjectViewsState> | ProjectViewsState) => void

function retitle(set: SetState, paneId: string, change: (t: SessionTitle) => SessionTitle): void {
  set((s) => {
    const found = findSessionByPane(s, paneId)
    if (!found) return s
    const { title, titleRenamed, titleFromClaude } = change(found.session)
    const same =
      title === found.session.title &&
      titleRenamed === found.session.titleRenamed &&
      titleFromClaude === found.session.titleFromClaude
    if (same) return s
    const view = s.views[found.projectId]
    const claudeSessions = view.claudeSessions.map((c) =>
      c.id === paneId ? { ...c, title, titleRenamed, titleFromClaude } : c
    )
    return { views: { ...s.views, [found.projectId]: { ...view, claudeSessions } } }
  })
}

/** A past session keeps the kind of title it was listed with, so a rename or Claude's title still wins over prompts. */
function loadedTitle(info: LocalSessionInfo): SessionTitle {
  if (info.titleSource === 'renamed') return { title: info.title, titleRenamed: true }
  if (info.titleSource === 'claude') return { title: info.title, titleFromClaude: true }
  return { title: migratedTitle([info.title]) }
}

function updateSession(set: SetState, paneId: string, change: Partial<ClaudeChatSession>): void {
  set((s) => {
    const found = findSessionByPane(s, paneId)
    if (!found) return s
    const view = s.views[found.projectId]
    const claudeSessions = view.claudeSessions.map((c) => (c.id === paneId ? { ...c, ...change } : c))
    return { views: { ...s.views, [found.projectId]: { ...view, claudeSessions } } }
  })
}


/** Titles for sessions saved before they had one, from the user messages already in their chat. */
function migrateTitles(views: Record<string, { claudeSessions: unknown[] }>): void {
  const items = useChatItemsStore.getState().items
  for (const v of Object.values(views)) {
    v.claudeSessions = v.claudeSessions.map((raw) => {
      const { label: _label, ...c } = raw as ClaudeChatSession & { label?: string }
      if (typeof c.title === 'string') return c
      const prompts = (items[c.id] ?? []).flatMap((i) => (i.kind === 'user' ? [i.text.replace(ATTACHED_MARKER, '')] : []))
      return { ...c, title: migratedTitle(prompts) }
    })
  }
}

/** The session's own mode, read fresh: a change made while a launch was awaited must count. */
export function storedPermissionMode(paneId: string): PermissionMode | undefined {
  return findSessionByPane(useProjectViewsStore.getState(), paneId)?.session.permissionMode
}

function profileOf(workspaceId: string): string {
  return useWorkspacesStore.getState().workspaces.find((w) => w.id === workspaceId)?.profileId ?? DEFAULT_PROFILE_ID
}

/** The shell tabs of the workspace a chat session belongs to. */

export function shellTabsOfSession(paneId: string): ShellTab[] {
  const view = Object.values(useProjectViewsStore.getState().views).find((v) => v.claudeSessions.some((c) => c.id === paneId))
  return view?.shellTabs ?? []
}

export const useProjectViewsStore = create<ProjectViewsState>()(
  persist(
    (set, get) => ({
      views: {},
      order: [],
      activeProjectId: null,
      activityView: 'explorer',
      setActivityView: (view) => set({ activityView: view }),

      openProject: (project, options) => {
        const existing = get().views[project.id]
        if (existing) {
          set({ activeProjectId: project.id })
          return
        }
        const firstSession: ClaudeChatSession | null =
          options?.firstSession === false
            ? null
            : { id: makeId(), title: NEW_SESSION_TITLE, ...startingChoiceOn(project.profileId), thinking: true }
        const view: ProjectView = {
          projectId: project.id,
          projectName: project.name,
          projectPath: project.path,
          claudeSessions: firstSession ? [firstSession] : [],
          activeClaudeSessionId: firstSession?.id ?? null,
          shellTabs: [],
          activeShellTabId: null,
          openFiles: [],
          activeFilePath: null,
          openDiffs: [],
          activeDiffId: null,
          centerView: 'chat',
          idePanelsOpen: false,
          shellDrawerOpen: false
        }
        set((s) => ({
          views: { ...s.views, [project.id]: view },
          order: s.order.includes(project.id) ? s.order : [...s.order, project.id],
          activeProjectId: project.id
        }))
      },

      closeProject: (projectId) => {
        const view = get().views[projectId]
        if (!view) return
        for (const sess of view.claudeSessions) {
          window.api.claude.stop(sess.id)
          useChatItemsStore.getState().deletePane(sess.id)
        }
        for (const tab of view.shellTabs) window.api.pty.kill(tab.id)
        set((s) => {
          const nextViews = { ...s.views }
          delete nextViews[projectId]
          const nextOrder = s.order.filter((id) => id !== projectId)
          const nextActive =
            s.activeProjectId === projectId
              ? nextOrder[nextOrder.length - 1] ?? null
              : s.activeProjectId
          return { views: nextViews, order: nextOrder, activeProjectId: nextActive }
        })
      },

      setActive: (projectId) => set({ activeProjectId: projectId }),

      toggleIdePanels: (projectId) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const next = toggleIdePanels(v)
          // The side panel choice is shared by all workspaces; never open the IDE onto an empty side.
          const activityView = next.idePanelsOpen && s.activityView === null ? 'explorer' : s.activityView
          return { views: { ...s.views, [projectId]: next }, activityView }
        }),

      toggleShellDrawer: (projectId) => {
        const v = get().views[projectId]
        if (!v) return
        if (v.shellTabs.length === 0) {
          get().openShell(projectId)
          return
        }
        get().setShellDrawerOpen(projectId, !v.shellDrawerOpen)
      },
      setDefaultPermissionMode: (mode) => set({ defaultPermissionMode: mode }),

      addClaudeSession: (projectId, options) => {
        const view = get().views[projectId]
        if (!view) return null
        const session: ClaudeChatSession = {
          id: makeId(),
          title: NEW_SESSION_TITLE,
          ...(options?.model ? { model: options.model } : startingChoiceOn(profileOf(projectId))),
          thinking: true,
          permissionMode: options?.permissionMode,
          ...(options?.addDirs?.length ? { addDirs: options.addDirs } : {})
        }
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const nextView: ProjectView = {
            ...v,
            claudeSessions: [...v.claudeSessions, session],
            activeClaudeSessionId: session.id
          }
          return { views: { ...s.views, [projectId]: nextView } }
        })
        return session
      },

      closeClaudeSession: (projectId, sessionId) => {
        window.api.claude.stop(sessionId)
        useChatItemsStore.getState().deletePane(sessionId)
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const remaining = v.claudeSessions.filter((c) => c.id !== sessionId)
          const nextActive =
            v.activeClaudeSessionId === sessionId
              ? remaining[remaining.length - 1]?.id ?? null
              : v.activeClaudeSessionId
          const nextView: ProjectView = {
            ...v,
            claudeSessions: remaining,
            activeClaudeSessionId: nextActive
          }
          return { views: { ...s.views, [projectId]: nextView } }
        })
      },

      setActiveClaudeSession: (projectId, sessionId) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          return {
            views: { ...s.views, [projectId]: { ...v, activeClaudeSessionId: sessionId } }
          }
        }),

      setClaudeSessionId: (paneId, claudeSessionId) =>
        set((s) => {
          const found = findSessionByPane(s, paneId)
          if (!found) return s
          if (found.session.claudeSessionId === claudeSessionId) return s
          const view = s.views[found.projectId]
          const nextSessions = view.claudeSessions.map((c) =>
            c.id === paneId ? { ...c, claudeSessionId } : c
          )
          return {
            views: {
              ...s.views,
              [found.projectId]: { ...view, claudeSessions: nextSessions }
            }
          }
        }),

      clearClaudeSessionId: (paneId) =>
        set((s) => {
          const found = findSessionByPane(s, paneId)
          if (!found) return s
          const view = s.views[found.projectId]
          const nextSessions = view.claudeSessions.map((c) =>
            c.id === paneId ? { ...c, claudeSessionId: undefined } : c
          )
          return {
            views: {
              ...s.views,
              [found.projectId]: { ...view, claudeSessions: nextSessions }
            }
          }
        }),

      setSessionPermissionMode: (paneId, mode) => updateSession(set, paneId, { permissionMode: mode }),
      setSessionModel: (paneId, model) => updateSession(set, paneId, { model, effort: undefined }),
      setSessionEffort: (paneId, effort) => updateSession(set, paneId, { effort }),
      setSessionThinking: (paneId, thinking) => updateSession(set, paneId, { thinking }),

      renameSession: (paneId, name) => retitle(set, paneId, (t) => titleAfterRename(t, name)),

      notePrompt: (paneId, text) => retitle(set, paneId, (t) => titleAfterPrompt(t, text)),

      applyClaudeTitle: (paneId, title) => retitle(set, paneId, (t) => titleAfterClaude(t, title)),

      duplicateSession: (projectId, sessionId) => {
        const view = get().views[projectId]
        if (!view) return null
        const source = view.claudeSessions.find((c) => c.id === sessionId)
        if (!source) return null
        const dup: ClaudeChatSession = {
          id: makeId(),
          title: NEW_SESSION_TITLE,
          model: source.model,
          effort: source.effort,
          thinking: source.thinking,
          permissionMode: source.permissionMode
          // intentionally no claudeSessionId — start fresh
        }
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          return {
            views: {
              ...s.views,
              [projectId]: {
                ...v,
                claudeSessions: [...v.claudeSessions, dup],
                activeClaudeSessionId: dup.id
              }
            }
          }
        })
        return dup
      },

      loadSessionFromLocal: (projectId, info, model) => {
        const view = get().views[projectId]
        if (!view) return null
        const session: ClaudeChatSession = {
          id: makeId(),
          ...loadedTitle(info),
          ...startingChoiceOn(profileOf(projectId), { model }),
          thinking: true,
          claudeSessionId: info.sessionId
        }
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          return {
            views: {
              ...s.views,
              [projectId]: {
                ...v,
                claudeSessions: [...v.claudeSessions, session],
                activeClaudeSessionId: session.id
              }
            }
          }
        })
        return session
      },

      setShellDrawerOpen: (projectId, open) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v || v.shellDrawerOpen === open) return s
          return { views: { ...s.views, [projectId]: { ...v, shellDrawerOpen: open } } }
        }),

      openShell: (projectId, options) => {
        const v = get().views[projectId]
        if (!v) return null
        const opened = openShellTab(v, {
          id: makeId(),
          kind: options?.kind ?? 'pwsh',
          env: options?.env
        })
        set((s) => ({ views: { ...s.views, [projectId]: opened } }))
        return opened.shellTabs[opened.shellTabs.length - 1]
      },

      addShellTab: (projectId, kind = 'pwsh') => get().openShell(projectId, { kind }),

      closeShellTab: (projectId, tabId) => {
        window.api.pty.kill(tabId)
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const remaining = v.shellTabs.filter((t) => t.id !== tabId)
          const nextActive =
            v.activeShellTabId === tabId
              ? remaining[remaining.length - 1]?.id ?? null
              : v.activeShellTabId
          const nextView: ProjectView = {
            ...v,
            shellTabs: remaining,
            activeShellTabId: nextActive,
            shellDrawerOpen: remaining.length === 0 ? false : v.shellDrawerOpen
          }
          return { views: { ...s.views, [projectId]: nextView } }
        })
      },

      setActiveShellTab: (projectId, tabId) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          return {
            views: {
              ...s.views,
              [projectId]: { ...v, activeShellTabId: tabId }
            }
          }
        }),

      openFile: (projectId, file) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const existing = v.openFiles.find((f) => f.path === file.path)
          if (existing) {
            return {
              views: {
                ...s.views,
                [projectId]: { ...v, activeFilePath: file.path, centerView: 'file' }
              }
            }
          }
          return {
            views: {
              ...s.views,
              [projectId]: {
                ...v,
                openFiles: [...v.openFiles, file],
                activeFilePath: file.path,
                centerView: 'file'
              }
            }
          }
        }),

      closeFile: (projectId, path) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const remaining = v.openFiles.filter((f) => f.path !== path)
          const nextActive =
            v.activeFilePath === path
              ? remaining[remaining.length - 1]?.path ?? null
              : v.activeFilePath
          return {
            views: {
              ...s.views,
              [projectId]: { ...v, openFiles: remaining, activeFilePath: nextActive }
            }
          }
        }),

      setActiveFile: (projectId, path) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          return { views: { ...s.views, [projectId]: { ...v, activeFilePath: path } } }
        }),

      updateFileContent: (projectId, path, content) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const next = v.openFiles.map((f) =>
            f.path === path ? { ...f, content, dirty: true } : f
          )
          return {
            views: { ...s.views, [projectId]: { ...v, openFiles: next } }
          }
        }),

      markFileSaved: (projectId, path) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const next = v.openFiles.map((f) =>
            f.path === path ? { ...f, dirty: false } : f
          )
          return {
            views: { ...s.views, [projectId]: { ...v, openFiles: next } }
          }
        }),

      setCenterView: (projectId, viewKind) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          return {
            views: { ...s.views, [projectId]: { ...v, centerView: viewKind } }
          }
        }),

      openDiff: (projectId, info) => {
        const v = get().views[projectId]
        if (!v) return null
        const existing = v.openDiffs.find(
          (d) => d.path === info.path && d.kind === info.kind
        )
        if (existing) {
          set((s) => {
            const cur = s.views[projectId]
            if (!cur) return s
            const updated = cur.openDiffs.map((d) =>
              d.id === existing.id ? { ...d, diffText: info.diffText } : d
            )
            return {
              views: {
                ...s.views,
                [projectId]: {
                  ...cur,
                  openDiffs: updated,
                  activeDiffId: existing.id,
                  centerView: 'diff'
                }
              }
            }
          })
          return existing
        }
        const diff: OpenDiff = {
          id: makeId(),
          path: info.path,
          kind: info.kind,
          diffText: info.diffText
        }
        set((s) => {
          const cur = s.views[projectId]
          if (!cur) return s
          return {
            views: {
              ...s.views,
              [projectId]: {
                ...cur,
                openDiffs: [...cur.openDiffs, diff],
                activeDiffId: diff.id,
                centerView: 'diff'
              }
            }
          }
        })
        return diff
      },

      closeDiff: (projectId, diffId) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const remaining = v.openDiffs.filter((d) => d.id !== diffId)
          const nextActiveDiffId =
            v.activeDiffId === diffId
              ? remaining[remaining.length - 1]?.id ?? null
              : v.activeDiffId
          // If no diffs left and we were on the diff view, drop back to chat.
          const nextCenter =
            v.centerView === 'diff' && remaining.length === 0 ? 'chat' : v.centerView
          return {
            views: {
              ...s.views,
              [projectId]: {
                ...v,
                openDiffs: remaining,
                activeDiffId: nextActiveDiffId,
                centerView: nextCenter
              }
            }
          }
        }),

      setActiveDiff: (projectId, diffId) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          return {
            views: { ...s.views, [projectId]: { ...v, activeDiffId: diffId } }
          }
        }),

      updateDiffText: (projectId, diffId, diffText) =>
        set((s) => {
          const v = s.views[projectId]
          if (!v) return s
          const next = v.openDiffs.map((d) => (d.id === diffId ? { ...d, diffText } : d))
          return { views: { ...s.views, [projectId]: { ...v, openDiffs: next } } }
        })
    }),
    {
      name: 'command-center.project-views',
      storage: createJSONStorage(() => localStorage),
      version: LAYOUT_VERSION,
      migrate: (persisted: unknown, fromVersion: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted as ProjectViewsState
        const state = persisted as {
          views?: Record<string, ProjectView & { bottomPanelOpen?: boolean }>
          bottomPanelOpen?: boolean
        }
        if (fromVersion < 3 && state.views) {
          for (const v of Object.values(state.views)) {
            v.claudeSessions = v.claudeSessions.map((c) => ({
              ...c,
              permissionMode: c.permissionMode ?? 'acceptEdits'
            }))
          }
        }
        if (fromVersion < 4 && state.views) {
          for (const v of Object.values(state.views)) {
            if (!Array.isArray(v.openFiles)) v.openFiles = []
            if (typeof v.activeFilePath === 'undefined') v.activeFilePath = null
          }
        }
        if (fromVersion < 5 && state.views) {
          for (const v of Object.values(state.views)) {
            if (typeof v.centerView !== 'string') v.centerView = 'chat'
          }
        }
        if (fromVersion < 6 && state.views) {
          for (const v of Object.values(state.views)) {
            if (typeof v.bottomPanelOpen !== 'boolean') v.bottomPanelOpen = false
          }
          delete state.bottomPanelOpen
        }
        if (fromVersion < 7 && state.views) {
          for (const v of Object.values(state.views)) {
            if (!Array.isArray(v.openDiffs)) v.openDiffs = []
            if (typeof v.activeDiffId === 'undefined') v.activeDiffId = null
          }
        }
        migrateLayout(state, fromVersion)
        if (fromVersion < 9 && state.views) migrateTitles(state.views)
        if (fromVersion < 10) migratePermissionModes(state as SavedModes)
        if (fromVersion < 11) migrateModelChoices(state as SavedModelChoices)
        if (fromVersion < 12) unsetStoreDefault(state as SavedModes)
        return persisted as ProjectViewsState
      },
      partialize: (state) => ({
        views: Object.fromEntries(
          Object.entries(state.views).map(([id, v]) => [id, persistableView(v)])
        ),
        order: state.order,
        activeProjectId: state.activeProjectId,
        defaultPermissionMode: state.defaultPermissionMode,
        activityView: state.activityView
      })
    }
  )
)
