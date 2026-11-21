import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  AppExitEvent,
  AppOutputEvent,
  ClaudeEventEnvelope,
  ClaudeExitEnvelope,
  ManagedApp,
  PermissionRequest,
  PermissionResponse,
  Project,
  PtyDataEvent,
  PtyExitEvent,
  RendererApi,
  SpawnResult
} from '../shared/types'

const api: RendererApi = {
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke(IPC.PROJECTS_LIST),
    add: (): Promise<Project | null> => ipcRenderer.invoke(IPC.PROJECTS_ADD),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PROJECTS_REMOVE, id)
  },
  apps: {
    list: (): Promise<ManagedApp[]> => ipcRenderer.invoke(IPC.APPS_LIST),
    add: (app) => ipcRenderer.invoke(IPC.APPS_ADD, app),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.APPS_REMOVE, id),
    start: (id: string, update?: boolean) => ipcRenderer.invoke(IPC.APPS_START, id, update),
    stop: (id: string) => ipcRenderer.invoke(IPC.APPS_STOP, id),
    status: () => ipcRenderer.invoke(IPC.APPS_STATUS),
    onOutput: (cb) => {
      const handler = (_e: IpcRendererEvent, event: AppOutputEvent) => cb(event)
      ipcRenderer.on(IPC.APPS_OUTPUT, handler)
      return () => ipcRenderer.off(IPC.APPS_OUTPUT, handler)
    },
    onExit: (cb) => {
      const handler = (_e: IpcRendererEvent, event: AppExitEvent) => cb(event)
      ipcRenderer.on(IPC.APPS_EXIT, handler)
      return () => ipcRenderer.off(IPC.APPS_EXIT, handler)
    }
  },
  files: {
    list: (cwd: string): Promise<string[]> => ipcRenderer.invoke(IPC.FILES_LIST, cwd),
    saveAs: (suggestedName: string, content: string) =>
      ipcRenderer.invoke(IPC.FILES_SAVE_AS, suggestedName, content),
    read: (cwd: string, relativePath: string) =>
      ipcRenderer.invoke(IPC.FILES_READ, cwd, relativePath),
    write: (cwd: string, relativePath: string, content: string) =>
      ipcRenderer.invoke(IPC.FILES_WRITE, cwd, relativePath, content)
  },
  pty: {
    spawn: (paneId, kind, cwd): Promise<SpawnResult> =>
      ipcRenderer.invoke(IPC.PTY_SPAWN, paneId, kind, cwd),
    write: (paneId, data) => ipcRenderer.send(IPC.PTY_WRITE, paneId, data),
    resize: (paneId, cols, rows) => ipcRenderer.send(IPC.PTY_RESIZE, paneId, cols, rows),
    kill: (paneId) => ipcRenderer.send(IPC.PTY_KILL, paneId),
    onData: (cb) => {
      const handler = (_e: IpcRendererEvent, event: PtyDataEvent) => cb(event)
      ipcRenderer.on(IPC.PTY_DATA, handler)
      return () => ipcRenderer.off(IPC.PTY_DATA, handler)
    },
    onExit: (cb) => {
      const handler = (_e: IpcRendererEvent, event: PtyExitEvent) => cb(event)
      ipcRenderer.on(IPC.PTY_EXIT, handler)
      return () => ipcRenderer.off(IPC.PTY_EXIT, handler)
    }
  },
  claude: {
    start: (paneId, cwd, model, resumeSessionId, permissionMode): Promise<SpawnResult> =>
      ipcRenderer.invoke(
        IPC.CLAUDE_START,
        paneId,
        cwd,
        model,
        resumeSessionId,
        permissionMode
      ),
    send: (paneId, text, images) => ipcRenderer.send(IPC.CLAUDE_SEND, paneId, text, images),
    listLocalSessions: (cwd) => ipcRenderer.invoke(IPC.CLAUDE_LIST_LOCAL_SESSIONS, cwd),
    interrupt: (paneId) => ipcRenderer.send(IPC.CLAUDE_INTERRUPT, paneId),
    stop: (paneId) => ipcRenderer.send(IPC.CLAUDE_STOP, paneId),
    onEvent: (cb) => {
      const handler = (_e: IpcRendererEvent, envelope: ClaudeEventEnvelope) => cb(envelope)
      ipcRenderer.on(IPC.CLAUDE_EVENT, handler)
      return () => ipcRenderer.off(IPC.CLAUDE_EVENT, handler)
    },
    onExit: (cb) => {
      const handler = (_e: IpcRendererEvent, envelope: ClaudeExitEnvelope) => cb(envelope)
      ipcRenderer.on(IPC.CLAUDE_EXIT, handler)
      return () => ipcRenderer.off(IPC.CLAUDE_EXIT, handler)
    }
  },
  permission: {
    onRequest: (cb) => {
      const handler = (_e: IpcRendererEvent, request: PermissionRequest) => cb(request)
      ipcRenderer.on(IPC.PERMISSION_REQUEST, handler)
      return () => ipcRenderer.off(IPC.PERMISSION_REQUEST, handler)
    },
    respond: (requestId: string, response: PermissionResponse, allowForSession?: boolean) =>
      ipcRenderer.send(IPC.PERMISSION_RESPOND, requestId, response, allowForSession)
  },
  git: {
    status: (cwd: string) => ipcRenderer.invoke(IPC.GIT_STATUS, cwd),
    diff: (cwd: string, path: string, staged: boolean, untracked?: boolean) =>
      ipcRenderer.invoke(IPC.GIT_DIFF, cwd, path, staged, untracked)
  }
}

contextBridge.exposeInMainWorld('api', api)
