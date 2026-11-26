import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { observedRefreshMs } from '../shared/observedRefresh'
import type { SubagentTailEvent } from '../shared/subagentTail'
import type { SettingsFileChange } from '../shared/claudeSettings'
import type {
  AccountProfile,
  AppExitEvent,
  AppView,
  BackgroundProcessesEntry,
  AppOutputEvent,
  AddWorkspaceResult,
  BoardModel,
  DiscoveryModel,
  ClaudeEventEnvelope,
  ClaudeExitEnvelope,
  ManagedApp,
  ObservedItemsEvent,
  ObservedSession,
  ProfileUsage,
  TerminalDataEvent,
  TerminalInfo,
  RendererApi,
  ScreenFocus,
  SessionStatusEntry,
  UpdateStatus,
  SpawnResult,
  ClaudeStartResult,
  StartWithWindowsState,
  Workspace,
  ControlResult,
  SessionInit,
  ModelDefaults,
  SaveDefaultsResult,
  SessionInitEnvelope,
  MentionEntry
} from '../shared/types'
import type { ApprovalReply, ApprovalRequest, ApprovalSettled } from '../shared/approval'
import type { RepoIdentityViews } from '../shared/repoIdentity'
import type { SpeechModelStatus, VideoProgressEvent } from '../shared/video'
import type { TestFlowFocus } from '../shared/testFlow'
import type { FeatureStageView } from '../shared/featureStage'
import type { FeatureServersView } from '../shared/featureServers'

const api: RendererApi = {
  workspaces: {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke(IPC.WORKSPACES_LIST),
    add: (): Promise<Workspace | null> => ipcRenderer.invoke(IPC.WORKSPACES_ADD),
    addPath: (path: string): Promise<AddWorkspaceResult> => ipcRenderer.invoke(IPC.WORKSPACES_ADD_PATH, path),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.WORKSPACES_REMOVE, id),
    setProfile: (id: string, profileId: string): Promise<Workspace | null> =>
      ipcRenderer.invoke(IPC.WORKSPACES_SET_PROFILE, id, profileId),
    reorder: (ids: string[]): Promise<Workspace[]> => ipcRenderer.invoke(IPC.WORKSPACES_REORDER, ids)
  },
  features: {
    list: () => ipcRenderer.invoke(IPC.FEATURES_LIST),
    create: (request) => ipcRenderer.invoke(IPC.FEATURES_CREATE, request),
    discard: (name, workspaceId) => ipcRenderer.invoke(IPC.FEATURES_DISCARD, name, workspaceId),
    stages: () => ipcRenderer.invoke(IPC.FEATURES_STAGES),
    setClaudeSession: (name, claudeSessionId) => ipcRenderer.invoke(IPC.FEATURES_SET_CLAUDE_SESSION, name, claudeSessionId),
    onStagesChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, stages: Record<string, FeatureStageView>) => cb(stages)
      ipcRenderer.on(IPC.FEATURES_STAGES_CHANGED, handler)
      return () => ipcRenderer.off(IPC.FEATURES_STAGES_CHANGED, handler)
    },
    onInstalling: (cb) => {
      const handler = (_e: IpcRendererEvent, event: { name: string; running: boolean }) => cb(event.name, event.running)
      ipcRenderer.on(IPC.FEATURES_INSTALLING, handler)
      return () => ipcRenderer.off(IPC.FEATURES_INSTALLING, handler)
    },
    startServers: (name) => ipcRenderer.invoke(IPC.FEATURES_SERVERS_START, name),
    retryServer: (name, server) => ipcRenderer.invoke(IPC.FEATURES_SERVERS_RETRY, name, server),
    stopServers: (name) => ipcRenderer.invoke(IPC.FEATURES_SERVERS_STOP, name),
    servers: () => ipcRenderer.invoke(IPC.FEATURES_SERVERS),
    onServersChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, event: { name: string; view: FeatureServersView }) => cb(event.name, event.view)
      ipcRenderer.on(IPC.FEATURES_SERVERS_CHANGED, handler)
      return () => ipcRenderer.off(IPC.FEATURES_SERVERS_CHANGED, handler)
    }
  },
  previewConfig: {
    get: (workspaceId) => ipcRenderer.invoke(IPC.PREVIEW_CONFIG_GET, workspaceId),
    save: (workspaceId, raw) => ipcRenderer.invoke(IPC.PREVIEW_CONFIG_SAVE, workspaceId, raw)
  },
  sidebarGroups: {
    load: () => ipcRenderer.invoke(IPC.SIDEBAR_GROUPS_LOAD),
    save: (layout) => ipcRenderer.invoke(IPC.SIDEBAR_GROUPS_SAVE, layout)
  },
  chatHistory: {
    loadSync: () => ipcRenderer.sendSync(IPC.CHAT_HISTORY_LOAD),
    apply: (paneId, changes) => ipcRenderer.send(IPC.CHAT_HISTORY_APPLY, paneId, changes),
    importLegacy: (entry) => ipcRenderer.invoke(IPC.CHAT_HISTORY_IMPORT_LEGACY, entry)
  },
  repoIdentities: {
    list: () => ipcRenderer.invoke(IPC.REPO_IDENTITIES_LIST),
    setDisplayName: (repoGroupKey, name) => ipcRenderer.invoke(IPC.REPO_IDENTITIES_SET_NAME, repoGroupKey, name),
    setIcon: (repoGroupKey, icon) => ipcRenderer.invoke(IPC.REPO_IDENTITIES_SET_ICON, repoGroupKey, icon),
    chooseImage: (repoGroupKey) => ipcRenderer.invoke(IPC.REPO_IDENTITIES_CHOOSE_IMAGE, repoGroupKey),
    setRendered: (repoGroupKey, pngDataUrl) =>
      ipcRenderer.send(IPC.REPO_IDENTITIES_SET_RENDERED, repoGroupKey, pngDataUrl),
    detect: (repoGroupKey) => ipcRenderer.invoke(IPC.REPO_IDENTITIES_DETECT, repoGroupKey),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, identities: RepoIdentityViews) => cb(identities)
      ipcRenderer.on(IPC.REPO_IDENTITIES_CHANGED, handler)
      return () => ipcRenderer.off(IPC.REPO_IDENTITIES_CHANGED, handler)
    }
  },
  profiles: {
    list: (): Promise<AccountProfile[]> => ipcRenderer.invoke(IPC.PROFILES_LIST),
    create: (name: string): Promise<AccountProfile> => ipcRenderer.invoke(IPC.PROFILES_CREATE, name),
    rename: (id: string, name: string): Promise<AccountProfile | null> =>
      ipcRenderer.invoke(IPC.PROFILES_RENAME, id, name),
    suggestions: () => ipcRenderer.invoke(IPC.PROFILES_SUGGESTIONS),
    adopt: (path: string) => ipcRenderer.invoke(IPC.PROFILES_ADOPT, path),
    chooseFolder: () => ipcRenderer.invoke(IPC.PROFILES_CHOOSE_FOLDER),
    remove: (id: string) => ipcRenderer.invoke(IPC.PROFILES_REMOVE, id)
  },
  vscodeMatch: {
    get: () => ipcRenderer.invoke(IPC.VSCODE_MATCH_GET),
    dismiss: (keys: string[]) => ipcRenderer.invoke(IPC.VSCODE_MATCH_DISMISS, keys),
    dismissNotice: () => ipcRenderer.invoke(IPC.VSCODE_MATCH_DISMISS_NOTICE),
    apply: (workspaceIds: string[]) => ipcRenderer.invoke(IPC.VSCODE_MATCH_APPLY, workspaceIds)
  },
  usage: {
    list: (): Promise<ProfileUsage[]> => ipcRenderer.invoke(IPC.USAGE_LIST),
    refresh: (profileId?: string) => ipcRenderer.send(IPC.USAGE_REFRESH, profileId),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, all: ProfileUsage[]) => cb(all)
      ipcRenderer.on(IPC.USAGE_CHANGED, handler)
      return () => ipcRenderer.off(IPC.USAGE_CHANGED, handler)
    }
  },
  board: {
    get: (): Promise<BoardModel> => ipcRenderer.invoke(IPC.BOARD_GET),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, model: BoardModel) => cb(model)
      ipcRenderer.on(IPC.BOARD_CHANGED, handler)
      return () => ipcRenderer.off(IPC.BOARD_CHANGED, handler)
    },
    readFile: (path: string): Promise<string | null> => ipcRenderer.invoke(IPC.BOARD_READ_FILE, path)
  },
  context: {
    report: (workspaceId: string) => ipcRenderer.invoke(IPC.CONTEXT_REPORT, workspaceId),
    startTotals: () => ipcRenderer.invoke(IPC.CONTEXT_START_TOTALS),
    readFile: (workspaceId: string, path: string) => ipcRenderer.invoke(IPC.CONTEXT_READ_FILE, workspaceId, path),
    writeFile: (workspaceId: string, path: string, content: string) => ipcRenderer.invoke(IPC.CONTEXT_WRITE_FILE, workspaceId, path, content)
  },
  claudeSettings: {
    read: (profileId, workspaceId) => ipcRenderer.invoke(IPC.CLAUDE_SETTINGS_READ, profileId, workspaceId),
    save: (path, base, patch) => ipcRenderer.invoke(IPC.CLAUDE_SETTINGS_SAVE, path, base, patch),
    unwatch: () => ipcRenderer.send(IPC.CLAUDE_SETTINGS_UNWATCH),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, change: SettingsFileChange) => cb(change)
      ipcRenderer.on(IPC.CLAUDE_SETTINGS_CHANGED, handler)
      return () => ipcRenderer.off(IPC.CLAUDE_SETTINGS_CHANGED, handler)
    }
  },
  driftChecks: {
    show: (workspaceId, fixing, live) => ipcRenderer.invoke(IPC.DRIFT_CHECKS_SHOW, workspaceId, fixing, live),
    release: () => ipcRenderer.invoke(IPC.DRIFT_CHECKS_RELEASE),
    begin: (skeleton) => ipcRenderer.invoke(IPC.DRIFT_CHECKS_BEGIN, skeleton),
    discard: (file) => ipcRenderer.invoke(IPC.DRIFT_CHECKS_DISCARD, file),
    onChanged: (cb) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.DRIFT_CHECKS_CHANGED, handler)
      return () => ipcRenderer.off(IPC.DRIFT_CHECKS_CHANGED, handler)
    }
  },
  discovery: {
    get: (): Promise<DiscoveryModel> => ipcRenderer.invoke(IPC.DISCOVERY_GET),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, model: DiscoveryModel) => cb(model)
      ipcRenderer.on(IPC.DISCOVERY_CHANGED, handler)
      return () => ipcRenderer.off(IPC.DISCOVERY_CHANGED, handler)
    },
    rescan: (): Promise<DiscoveryModel> => ipcRenderer.invoke(IPC.DISCOVERY_RESCAN),
    setRoots: (roots: string[]): Promise<DiscoveryModel> => ipcRenderer.invoke(IPC.DISCOVERY_SET_ROOTS, roots)
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
  video: {
    pathOf: (file) => webUtils.getPathForFile(file),
    prepare: (jobId, source) => ipcRenderer.invoke(IPC.VIDEO_PREPARE, jobId, source),
    transcribe: (jobId) => ipcRenderer.invoke(IPC.VIDEO_TRANSCRIBE, jobId),
    release: (jobId) => ipcRenderer.invoke(IPC.VIDEO_RELEASE, jobId),
    onProgress: (cb) => {
      const handler = (_e: IpcRendererEvent, event: VideoProgressEvent) => cb(event)
      ipcRenderer.on(IPC.VIDEO_PROGRESS, handler)
      return () => ipcRenderer.off(IPC.VIDEO_PROGRESS, handler)
    },
    modelStatus: () => ipcRenderer.invoke(IPC.VIDEO_MODEL_STATUS),
    downloadModel: () => ipcRenderer.invoke(IPC.VIDEO_MODEL_DOWNLOAD),
    cancelModelDownload: () => ipcRenderer.invoke(IPC.VIDEO_MODEL_CANCEL),
    removeModel: () => ipcRenderer.invoke(IPC.VIDEO_MODEL_REMOVE),
    onModelChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, status: SpeechModelStatus) => cb(status)
      ipcRenderer.on(IPC.VIDEO_MODEL_CHANGED, handler)
      return () => ipcRenderer.off(IPC.VIDEO_MODEL_CHANGED, handler)
    }
  },
  testFlow: {
    show: (watcher, paths) => ipcRenderer.invoke(IPC.TEST_FLOW_SHOW, watcher, paths),
    release: (watcher) => ipcRenderer.invoke(IPC.TEST_FLOW_RELEASE, watcher),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, watcher: string) => cb(watcher)
      ipcRenderer.on(IPC.TEST_FLOW_CHANGED, handler)
      return () => ipcRenderer.off(IPC.TEST_FLOW_CHANGED, handler)
    },
    folder: () => ipcRenderer.invoke(IPC.TEST_FLOW_FOLDER_GET),
    setFolder: (folder) => ipcRenderer.invoke(IPC.TEST_FLOW_FOLDER_SET, folder),
    popOut: () => ipcRenderer.invoke(IPC.TEST_FLOW_POP_OUT),
    publish: (focus) => ipcRenderer.send(IPC.TEST_FLOW_PUBLISH, focus),
    focus: () => ipcRenderer.invoke(IPC.TEST_FLOW_FOCUS_GET),
    onFocus: (cb) => {
      const handler = (_e: IpcRendererEvent, focus: TestFlowFocus) => cb(focus)
      ipcRenderer.on(IPC.TEST_FLOW_FOCUS, handler)
      return () => ipcRenderer.off(IPC.TEST_FLOW_FOCUS, handler)
    }
  },
  files: {
    resolveLink: (cwd, path) => ipcRenderer.invoke(IPC.FILES_RESOLVE_LINK, cwd, path),
    readImage: (path) => ipcRenderer.invoke(IPC.FILES_READ_IMAGE, path),
    openWithSystem: (path) => ipcRenderer.invoke(IPC.FILES_OPEN_WITH_SYSTEM, path),
    resolveMedia: (cwd, paths) => ipcRenderer.invoke(IPC.MEDIA_RESOLVE, cwd, paths),
    revealMedia: (path) => ipcRenderer.invoke(IPC.MEDIA_REVEAL, path),
    list: (cwd: string): Promise<string[]> => ipcRenderer.invoke(IPC.FILES_LIST, cwd),
    mentions: (cwd: string, query: string): Promise<MentionEntry[]> => ipcRenderer.invoke(IPC.FILES_MENTIONS, cwd, query),
    saveAs: (suggestedName: string, content: string) =>
      ipcRenderer.invoke(IPC.FILES_SAVE_AS, suggestedName, content),
    read: (cwd: string, relativePath: string) =>
      ipcRenderer.invoke(IPC.FILES_READ, cwd, relativePath),
    write: (cwd: string, relativePath: string, content: string) =>
      ipcRenderer.invoke(IPC.FILES_WRITE, cwd, relativePath, content)
  },
  terminals: {
    list: () => ipcRenderer.invoke(IPC.TERMINALS_LIST),
    create: (request) => ipcRenderer.invoke(IPC.TERMINALS_CREATE, request),
    attach: (id) => ipcRenderer.invoke(IPC.TERMINALS_ATTACH, id),
    write: (id, data) => ipcRenderer.send(IPC.TERMINALS_WRITE, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.TERMINALS_RESIZE, id, cols, rows),
    rename: (id, label) => ipcRenderer.send(IPC.TERMINALS_RENAME, id, label),
    restart: (id) => ipcRenderer.invoke(IPC.TERMINALS_RESTART, id),
    stop: (id) => ipcRenderer.invoke(IPC.TERMINALS_STOP, id),
    close: (id) => ipcRenderer.send(IPC.TERMINALS_CLOSE, id),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, list: TerminalInfo[]) => cb(list)
      ipcRenderer.on(IPC.TERMINALS_CHANGED, handler)
      return () => ipcRenderer.off(IPC.TERMINALS_CHANGED, handler)
    },
    onData: (cb) => {
      const handler = (_e: IpcRendererEvent, event: TerminalDataEvent) => cb(event)
      ipcRenderer.on(IPC.TERMINALS_DATA, handler)
      return () => ipcRenderer.off(IPC.TERMINALS_DATA, handler)
    }
  },
  claude: {
    start: (options): Promise<ClaudeStartResult> => ipcRenderer.invoke(IPC.CLAUDE_START, options),
    processProfile: (paneId): Promise<string | null> => ipcRenderer.invoke(IPC.CLAUDE_PROCESS_PROFILE, paneId),
    control: (paneId, subtype, fields): Promise<ControlResult> =>
      ipcRenderer.invoke(IPC.CLAUDE_CONTROL, paneId, subtype, fields),
    getInit: (paneId): Promise<SessionInit | null> => ipcRenderer.invoke(IPC.CLAUDE_GET_INIT, paneId),
    readDefaults: (profileId: string): Promise<ModelDefaults> => ipcRenderer.invoke(IPC.CLAUDE_READ_DEFAULTS, profileId),
    defaultPermissionMode: (cwd: string): Promise<string | null> => ipcRenderer.invoke(IPC.CLAUDE_DEFAULT_PERMISSION_MODE, cwd),
    saveDefaults: (patch): Promise<SaveDefaultsResult> => ipcRenderer.invoke(IPC.CLAUDE_SAVE_DEFAULTS, patch),
    onInit: (cb) => {
      const handler = (_e: IpcRendererEvent, envelope: SessionInitEnvelope) => cb(envelope)
      ipcRenderer.on(IPC.CLAUDE_INIT, handler)
      return () => ipcRenderer.off(IPC.CLAUDE_INIT, handler)
    },
    send: (paneId, content, uuid) => ipcRenderer.send(IPC.CLAUDE_SEND, paneId, content, uuid),
    listLocalSessions: (cwd) => ipcRenderer.invoke(IPC.CLAUDE_LIST_LOCAL_SESSIONS, cwd),
    renameSession: (rename) => ipcRenderer.invoke(IPC.CLAUDE_RENAME_SESSION, rename),
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
  subagents: {
    watch: (source) => ipcRenderer.send(IPC.SUBAGENTS_WATCH, source),
    unwatch: (source) => ipcRenderer.send(IPC.SUBAGENTS_UNWATCH, source),
    open: (target) => ipcRenderer.send(IPC.SUBAGENTS_OPEN, target),
    close: (target) => ipcRenderer.send(IPC.SUBAGENTS_CLOSE, target),
    onItems: (cb) => {
      const handler = (_e: IpcRendererEvent, event: SubagentTailEvent) => cb(event)
      ipcRenderer.on(IPC.SUBAGENTS_ITEMS, handler)
      return () => ipcRenderer.off(IPC.SUBAGENTS_ITEMS, handler)
    }
  },
  observed: {
    list: (): Promise<ObservedSession[]> => ipcRenderer.invoke(IPC.OBSERVED_LIST),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, sessions: ObservedSession[]) => cb(sessions)
      ipcRenderer.on(IPC.OBSERVED_CHANGED, handler)
      return () => ipcRenderer.off(IPC.OBSERVED_CHANGED, handler)
    },
    setHosted: (sessionIds: string[]) => ipcRenderer.send(IPC.OBSERVED_SET_HOSTED, sessionIds),
    open: (workspaceId: string, sessionId: string) =>
      ipcRenderer.invoke(IPC.OBSERVED_OPEN, workspaceId, sessionId),
    close: () => ipcRenderer.send(IPC.OBSERVED_CLOSE),
    turn: (workspaceId: string, sessionId: string) => ipcRenderer.invoke(IPC.OBSERVED_TURN, workspaceId, sessionId),
    read: (workspaceId: string, sessionId: string) => ipcRenderer.invoke(IPC.OBSERVED_READ, workspaceId, sessionId),
    image: (workspaceId: string, sessionId: string, uuid: string, block: number): Promise<string | null> =>
      ipcRenderer.invoke(IPC.OBSERVED_IMAGE, workspaceId, sessionId, uuid, block),
    liveConfigDir: (sessionId: string): Promise<string | null> => ipcRenderer.invoke(IPC.OBSERVED_LIVE_CONFIG_DIR, sessionId),
    refreshMs: observedRefreshMs(process.env),
    onItems: (cb) => {
      const handler = (_e: IpcRendererEvent, event: ObservedItemsEvent) => cb(event)
      ipcRenderer.on(IPC.OBSERVED_ITEMS, handler)
      return () => ipcRenderer.off(IPC.OBSERVED_ITEMS, handler)
    }
  },
  approval: {
    list: (): Promise<ApprovalRequest[]> => ipcRenderer.invoke(IPC.APPROVAL_LIST),
    onRequest: (cb) => {
      const handler = (_e: IpcRendererEvent, request: ApprovalRequest) => cb(request)
      ipcRenderer.on(IPC.APPROVAL_REQUEST, handler)
      return () => ipcRenderer.off(IPC.APPROVAL_REQUEST, handler)
    },
    onSettled: (cb) => {
      const handler = (_e: IpcRendererEvent, settled: ApprovalSettled) => cb(settled)
      ipcRenderer.on(IPC.APPROVAL_SETTLED, handler)
      return () => ipcRenderer.off(IPC.APPROVAL_SETTLED, handler)
    },
    respond: (requestId: string, reply: ApprovalReply) => ipcRenderer.send(IPC.APPROVAL_RESPOND, requestId, reply)
  },
  sessionStatus: {
    list: (): Promise<SessionStatusEntry[]> => ipcRenderer.invoke(IPC.SESSION_STATUS_LIST),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, entry: SessionStatusEntry) => cb(entry)
      ipcRenderer.on(IPC.SESSION_STATUS_CHANGED, handler)
      return () => ipcRenderer.off(IPC.SESSION_STATUS_CHANGED, handler)
    },
    reportScreenFocus: (focus: ScreenFocus) => ipcRenderer.send(IPC.SESSION_SCREEN_FOCUS, focus)
  },
  backgroundProcesses: {
    list: (): Promise<BackgroundProcessesEntry[]> => ipcRenderer.invoke(IPC.BACKGROUND_PROCESSES_LIST),
    portOpen: (port: number): Promise<boolean> => ipcRenderer.invoke(IPC.BACKGROUND_PROCESSES_PORT_OPEN, port),
    openInBrowser: (url: string): Promise<string | null> => ipcRenderer.invoke(IPC.BACKGROUND_PROCESSES_OPEN_IN_BROWSER, url),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, entry: BackgroundProcessesEntry) => cb(entry)
      ipcRenderer.on(IPC.BACKGROUND_PROCESSES_CHANGED, handler)
      return () => ipcRenderer.off(IPC.BACKGROUND_PROCESSES_CHANGED, handler)
    }
  },
  startWithWindows: {
    get: () => ipcRenderer.invoke(IPC.START_WITH_WINDOWS_GET),
    set: (checked) => ipcRenderer.invoke(IPC.START_WITH_WINDOWS_SET, checked),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, state: StartWithWindowsState) => cb(state)
      ipcRenderer.on(IPC.START_WITH_WINDOWS_CHANGED, handler)
      return () => ipcRenderer.off(IPC.START_WITH_WINDOWS_CHANGED, handler)
    }
  },
  zoom: {
    get: () => ipcRenderer.invoke(IPC.ZOOM_GET),
    step: (step) => ipcRenderer.invoke(IPC.ZOOM_STEP, step),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, level: number) => cb(level)
      ipcRenderer.on(IPC.ZOOM_CHANGED, handler)
      return () => ipcRenderer.off(IPC.ZOOM_CHANGED, handler)
    }
  },
  navigation: {
    onShowView: (cb) => {
      const handler = (_e: IpcRendererEvent, view: AppView) => cb(view)
      ipcRenderer.on(IPC.NAVIGATION_SHOW_VIEW, handler)
      return () => ipcRenderer.off(IPC.NAVIGATION_SHOW_VIEW, handler)
    },
    onOpenSession: (cb) => {
      const handler = (_e: IpcRendererEvent, paneId: string) => cb(paneId)
      ipcRenderer.on(IPC.NAVIGATION_OPEN_SESSION, handler)
      return () => ipcRenderer.off(IPC.NAVIGATION_OPEN_SESSION, handler)
    },
    onOpenApprovals: (cb) => {
      const handler = (_e: IpcRendererEvent, paneId: string) => cb(paneId)
      ipcRenderer.on(IPC.NAVIGATION_OPEN_APPROVALS, handler)
      return () => ipcRenderer.off(IPC.NAVIGATION_OPEN_APPROVALS, handler)
    }
  },
  git: {
    status: (cwd: string) => ipcRenderer.invoke(IPC.GIT_STATUS, cwd),
    diff: (cwd: string, path: string, staged: boolean, untracked?: boolean) =>
      ipcRenderer.invoke(IPC.GIT_DIFF, cwd, path, staged, untracked)
  },
  update: {
    status: () => ipcRenderer.invoke(IPC.UPDATE_STATUS),
    check: () => ipcRenderer.invoke(IPC.UPDATE_CHECK),
    restart: (force: boolean) => ipcRenderer.invoke(IPC.UPDATE_RESTART, force),
    setAutoRestart: (on: boolean) => ipcRenderer.invoke(IPC.UPDATE_SET_AUTO_RESTART, on),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, status: UpdateStatus) => cb(status)
      ipcRenderer.on(IPC.UPDATE_CHANGED, handler)
      return () => ipcRenderer.off(IPC.UPDATE_CHANGED, handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
