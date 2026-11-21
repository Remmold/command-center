import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PtyKind, Workspace } from '../../shared/types'
import { useChatItemsStore } from './chatItemsStore'
import {
  LAYOUT_VERSION,
  migrateLayout,
  openShellTab,
  persistableView,
  toggleIdePanels,
  type ShellOptions
} from './projectViewLayout'

export type ClaudeModel = 'sonnet' | 'opus' | 'haiku' | string
export type PermissionMode =
  | 'ask'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'

export const PERMISSION_MODES: PermissionMode[] = [
  'acceptEdits',
  'ask',
  'bypassPermissions',
  'plan'
]

export interface ClaudeChatSession {
  id: string
  label: string
  model: ClaudeModel
  permissionMode: PermissionMode
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
  defaultModel: ClaudeModel
  defaultPermissionMode: PermissionMode
  /** Currently visible side activity (file tree etc.). null = nothing visible. */
  activityView: ActivityView
  setActivityView: (view: ActivityView) => void

  openProject: (workspace: Workspace) => void
  closeProject: (projectId: string) => void
  setActive: (projectId: string) => void

  toggleIdePanels: (projectId: string) => void
  toggleShellDrawer: (projectId: string) => void
  setShellDrawerOpen: (projectId: string, open: boolean) => void
  setDefaultModel: (model: ClaudeModel) => void
  setDefaultPermissionMode: (mode: PermissionMode) => void

  addClaudeSession: (
    projectId: string,
    options?: { model?: ClaudeModel; permissionMode?: PermissionMode }
  ) => ClaudeChatSession | null
  closeClaudeSession: (projectId: string, sessionId: string) => void
  setActiveClaudeSession: (projectId: string, sessionId: string) => void
  setClaudeSessionId: (paneId: string, claudeSessionId: string) => void
  clearClaudeSessionId: (paneId: string) => void
  setSessionPermissionMode: (paneId: string, mode: PermissionMode) => void
  setSessionLabel: (paneId: string, label: string) => void
  duplicateSession: (projectId: string, sessionId: string) => ClaudeChatSession | null
  loadSessionFromLocal: (
    projectId: string,
    claudeSessionId: string,
    label?: string,
    model?: ClaudeModel
  ) => ClaudeChatSession | null

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

function nextChatLabel(existing: ClaudeChatSession[]): string {
  return `chat ${existing.length + 1}`
}

function findSessionByPane(state: ProjectViewsState, paneId: string): {
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

export const useProjectViewsStore = create<ProjectViewsState>()(
  persist(
    (set, get) => ({
      views: {},
      order: [],
      activeProjectId: null,
      defaultModel: 'sonnet',
      defaultPermissionMode: 'acceptEdits',
      activityView: 'explorer',
      setActivityView: (view) => set({ activityView: view }),

      openProject: (project) => {
        const existing = get().views[project.id]
        if (existing) {
          set({ activeProjectId: project.id })
          return
        }
        const firstSession: ClaudeChatSession = {
          id: makeId(),
          label: 'chat 1',
          model: get().defaultModel,
          permissionMode: get().defaultPermissionMode
        }
        const view: ProjectView = {
          projectId: project.id,
          projectName: project.name,
          projectPath: project.path,
          claudeSessions: [firstSession],
          activeClaudeSessionId: firstSession.id,
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
      setDefaultModel: (model) => set({ defaultModel: model }),
      setDefaultPermissionMode: (mode) => set({ defaultPermissionMode: mode }),

      addClaudeSession: (projectId, options) => {
        const view = get().views[projectId]
        if (!view) return null
        const session: ClaudeChatSession = {
          id: makeId(),
          label: nextChatLabel(view.claudeSessions),
          model: options?.model ?? get().defaultModel,
          permissionMode: options?.permissionMode ?? get().defaultPermissionMode
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

      setSessionPermissionMode: (paneId, mode) =>
        set((s) => {
          const found = findSessionByPane(s, paneId)
          if (!found) return s
          const view = s.views[found.projectId]
          const nextSessions = view.claudeSessions.map((c) =>
            c.id === paneId ? { ...c, permissionMode: mode } : c
          )
          return {
            views: {
              ...s.views,
              [found.projectId]: { ...view, claudeSessions: nextSessions }
            }
          }
        }),

      setSessionLabel: (paneId, label) =>
        set((s) => {
          const found = findSessionByPane(s, paneId)
          if (!found) return s
          const view = s.views[found.projectId]
          const nextSessions = view.claudeSessions.map((c) =>
            c.id === paneId ? { ...c, label } : c
          )
          return {
            views: {
              ...s.views,
              [found.projectId]: { ...view, claudeSessions: nextSessions }
            }
          }
        }),

      duplicateSession: (projectId, sessionId) => {
        const view = get().views[projectId]
        if (!view) return null
        const source = view.claudeSessions.find((c) => c.id === sessionId)
        if (!source) return null
        const dup: ClaudeChatSession = {
          id: makeId(),
          label: source.label + ' copy',
          model: source.model,
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

      loadSessionFromLocal: (projectId, claudeSessionId, label, model) => {
        const view = get().views[projectId]
        if (!view) return null
        const session: ClaudeChatSession = {
          id: makeId(),
          label: label ?? `loaded ${claudeSessionId.slice(0, 6)}`,
          model: model ?? get().defaultModel,
          permissionMode: get().defaultPermissionMode,
          claudeSessionId
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
        return persisted as ProjectViewsState
      },
      partialize: (state) => ({
        views: Object.fromEntries(
          Object.entries(state.views).map(([id, v]) => [id, persistableView(v)])
        ),
        order: state.order,
        activeProjectId: state.activeProjectId,
        defaultModel: state.defaultModel,
        defaultPermissionMode: state.defaultPermissionMode,
        activityView: state.activityView
      })
    }
  )
)
