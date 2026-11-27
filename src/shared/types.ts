import type { SpeechModelStatus, VideoFramesResult, VideoProgressEvent, VideoSource, VideoTranscriptResult } from './video'
import type { ChooseImageResult, RepoIconRequest, RepoIdentityViews } from './repoIdentity'
import type { ChatItem } from './chatItems'
import type { SubagentItemsSource, SubagentSource, SubagentTailEvent } from './subagentTail'
import type { AppView } from './views'
import type { ApprovalReply, ApprovalRequest, ApprovalSettled } from './approval'
import type { ObservedTurn } from './takeOver'
import type { MediaFile } from './media'
import type { TestFlowFocus, TestFlowView } from './testFlow'
import type { Mark, StepsView } from './testSteps'
import type { ZoomStep } from './zoom'
import type { LocalServer } from './localPorts'
import type { SidebarLayout } from './sidebarGroups'
import type { FeatureStageView } from './featureStage'
import type { FeatureServersView } from './featureServers'
import type { FeatureRecord, NewFeatureRequest, NewFeatureResult, PreflightRequest, PreflightResult } from './features'
import type { JustStarted, MainChatInfo } from './mainChat'
import type { PreviewConfig } from './previewConfig'
import type { PreviewDraftRead } from './previewSetup'
import type { HistoryChange } from './chatHistory'
import type { ContextFileResult, ContextFileText, ContextReport } from './context'
import type { ClaudeSettingsRead, SettingsFileChange, SettingsObject, SettingsPatch, SettingsSaveResult } from './claudeSettings'
import type { DriftChecksView, FindingsRun, SkeletonResult } from './findings'
import type { BackgroundProcess } from './backgroundProcesses'
export type { AppView }
export const DEFAULT_PROFILE_ID = 'default'

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: number
  profileId: string
  /** Shared by every worktree of one git repo; a folder outside git is its own group. */
  repoGroupKey: string
  repoName: string
  /** Empty for the main checkout. */
  worktreeTag: string
}

export interface AccountProfile {
  id: string
  name: string
  /** The Claude config folder; Default's is ~/.claude. */
  configDir: string
  /** True when the profile's credentials file exists. */
  loggedIn: boolean
  /** An existing folder the app adopted; the app never writes to or deletes it. */
  adopted: boolean
}

export interface VsCodeConfigDir {
  profileName: string
  configDir: string
}

/** A folder VS Code ties to a profile, and the Claude config folder that profile uses. */
export interface VsCodeFolderAccount {
  folder: string
  profileName: string
  configDir: string
}

/** What VS Code ties folders to, and which of its suggestions the user put away. */
export interface VsCodeMatch {
  folders: VsCodeFolderAccount[]
  /** Keys of dismissed mismatches. */
  dismissed: string[]
  noticeDismissed: boolean
}

export type UseVsCodeAccountsResult = { ok: true; accountNames: string[] } | { ok: false; error: string }

export type AdoptResult = { ok: true; profile: AccountProfile } | { ok: false; error: string }

export type SessionStatus = 'running' | 'needs-approval' | 'your-turn' | 'idle'

export const WAITING_STATUSES: readonly SessionStatus[] = ['needs-approval', 'your-turn']

export interface SessionStatusEntry {
  paneId: string
  cwd: string
  status: SessionStatus
  /** Epoch ms when the current status began. */
  since: number
}

/** A hosted session's background processes, running ones first; empty once its CLI process is gone. */
export interface BackgroundProcessesEntry {
  paneId: string
  processes: BackgroundProcess[]
}

export interface StartWithWindowsState {
  checked: boolean
  enabled: boolean
  /** Shown beside the control when it is disabled, e.g. why autostart isn't offered. */
  reason?: string
}

/** What the renderer has on screen, reported to main for notifications. */
export interface ScreenFocus {
  paneId: string | null
  windowVisible: boolean
}

export type PtyKind = 'pwsh' | 'powershell' | 'cmd' | 'bash'

/** The shell a new terminal runs in unless one is picked. */
export const DEFAULT_SHELL_KIND: PtyKind = 'pwsh'

export interface SpawnResult {
  ok: boolean
  error?: string
}

export interface ClaudeStartResult extends SpawnResult {
  /** The account profile the process was started on (its `CLAUDE_CONFIG_DIR`). */
  profileId?: string
}

/** A shell, or one command, the app runs for Andreas in a pty; kept by main (ADR 0006). */
export interface TerminalInfo {
  id: string
  workspaceId: string
  cwd: string
  label: string
  /** Run through the shell's run-a-command form; without one it is the plain shell. */
  command?: string
  kind: PtyKind
  /** Extra variables on top of the app's cleaned environment, e.g. an account's. */
  env?: Record<string, string>
  status: 'running' | 'exited'
  /** None when the app stopped it. */
  exitCode?: number
  startedAt: number
  endedAt?: number
  /** Local servers its output has named since it started, whether or not they answer; absent until one shows. */
  servers?: LocalServer[]
}

export interface CreateTerminalRequest {
  /** Chosen by the caller so a drawer tab can name it before the reply; one is made otherwise. */
  id?: string
  workspaceId: string
  cwd: string
  kind: PtyKind
  /** Defaults to the command, else the shell's name numbered within the workspace. */
  label?: string
  command?: string
  env?: Record<string, string>
}

export interface CreateTerminalResult {
  ok: boolean
  error?: string
  terminal?: TerminalInfo
}

/** What a view gets on attaching: the record and its recent output, before live data follows. */
export interface TerminalAttachment {
  terminal: TerminalInfo
  tail: string
}

export interface TerminalDataEvent {
  id: string
  data: string
}

// Claude stream-json events. Only the fields we care about — the JSON
// payloads from `claude --output-format stream-json` are large and we
// pass them through as `unknown` and narrow at the call site.
export interface ClaudeEventEnvelope {
  paneId: string
  /** Account profile the session runs on, fixed when its process started. */
  profileId: string
  event: ClaudeEvent
}

/** A model the CLI offers, from its `initialize` reply. */
export interface CliModel {
  value: string
  /** The full model id an alias such as `default` or `opus` stands for. */
  resolvedModel: string
  displayName: string
  description: string
  supportsEffort: boolean
  supportedEffortLevels: string[]
  supportsAutoMode: boolean
}

export interface CliAccount {
  email?: string
  organization?: string
  subscriptionType?: string
  apiProvider?: string
}

export interface CliCommand {
  name: string
  description: string
  argumentHint: string
  aliases: string[]
  /** The CLI's own command, as opposed to a skill, plugin or custom command. */
  builtin: boolean
}

/** What a hosted session's CLI reported in its `initialize` handshake. */
export interface SessionInit {
  models: CliModel[]
  account: CliAccount | null
  commands: CliCommand[]
  permissionMode: string
  remoteControl: RemoteControlInit
}

export interface RemoteControlInit {
  /** False when the CLI says Remote Control can't be offered here; unset when it didn't say. */
  available?: boolean
  /** Turn it on once the process is up: the CLI's start-up verdict (`remoteControlAtStartup` and rollout). */
  autoStart: boolean
}

export interface SessionInitEnvelope {
  paneId: string
  profileId: string
  init: SessionInit
}

export type ControlResult =
  | { ok: true; response: Record<string, unknown> }
  | { ok: false; error: string }

/** The extension's thinking budget when extended thinking is on. */
export const THINKING_BUDGET = 31999

export interface ClaudeStartOptions {
  paneId: string
  cwd: string
  model?: string
  effort?: string
  /** Extended thinking; on unless false. */
  thinking?: boolean
  resumeSessionId?: string
  permissionMode?: string
  /** Launches with `--allow-dangerously-skip-permissions`, so Bypass can be switched to later. */
  allowBypass?: boolean
  /** The app's "Suggest next prompt" setting; the account's own `promptSuggestionEnabled: false` still wins. */
  promptSuggestions?: boolean
  /** Folders outside `cwd` the session may read without asking, one `--add-dir` each. */
  addDirs?: readonly string[]
}

/** The model keys of the user `settings.json` that new sessions start with. */
export interface ModelDefaults {
  model?: string
  /** Saved effort per full model id, as the CLI keeps it under `modelSettings`. */
  effortByModel: Record<string, string>
}

/** A change to the saved defaults; `model: null` removes the key, so the CLI picks its own default. */
export interface ModelDefaultsPatch {
  model?: string | null
  effort?: { resolvedModel: string; level: string }
}

export type SaveDefaultsResult = { ok: true } | { ok: false; error: string }

export type ClaudeEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeUserEvent
  | ClaudeResultEvent
  | ClaudeStreamEvent
  | { type: string; [key: string]: unknown }

export interface ClaudeSystemEvent {
  type: 'system'
  subtype: string
  session_id?: string
  cwd?: string
  model?: string
  [key: string]: unknown
}

export interface ClaudeAssistantEvent {
  type: 'assistant'
  message: {
    id: string
    role: 'assistant'
    content: ContentBlock[]
    model?: string
    usage?: unknown
  }
  parent_tool_use_id?: string | null
  session_id?: string
  uuid?: string
}

export interface ClaudeUserEvent {
  type: 'user'
  message: {
    role: 'user'
    content: ContentBlock[]
  }
}

export interface ClaudeResultEvent {
  type: 'result'
  subtype: string
  is_error: boolean
  duration_ms?: number
  num_turns?: number
  result?: string
  stop_reason?: string
  total_cost_usd?: number
  session_id?: string
}

// Partial streaming events from --include-partial-messages
export interface ClaudeStreamEvent {
  type: 'stream_event'
  event: unknown
  parent_tool_use_id?: string | null
  session_id?: string
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: string; [key: string]: unknown }

export interface ClaudeExitEnvelope {
  paneId: string
  exitCode: number | null
}

/** One block of a user message's `content`, as the extension writes it to the CLI's stdin. */
export type UserContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string }; title: string }
  | { type: 'document'; source: { type: 'text'; media_type: 'text/plain'; data: string }; title: string }

/** A row of the @ menu; folders end in `/`. */
export interface MentionEntry {
  path: string
  name: string
  type: 'file' | 'directory'
}

export interface GitFile {
  path: string
  staged: string
  unstaged: string
}

export interface GitStatusResult {
  ok: boolean
  isRepo: boolean
  branch?: string
  files: GitFile[]
  error?: string
}

export interface GitDiffResult {
  ok: boolean
  text?: string
  error?: string
}

/** Where a past session's title came from: a rename (`custom-title`), Claude (`ai-title`) or a prompt. */
export type LocalSessionTitleSource = 'renamed' | 'claude' | 'prompt'

export interface SessionRename {
  cwd: string
  sessionId: string
  title: string
  /** The hosted session showing it, when one does; its running CLI takes the rename. */
  paneId?: string
}

/** `title` is the name as stored: cleaned and cut the way the CLI does it. */
export type RenameResult = { ok: true; title: string } | { ok: false; error: string }

export interface LocalSessionInfo {
  sessionId: string
  modifiedAt: number
  title: string
  titleSource: LocalSessionTitleSource
  /** The first prompt, whitespace collapsed. */
  preview: string
  gitBranch?: string
}

// A machine-wide app/server the command center can launch and monitor.
export interface ManagedApp {
  id: string
  name: string
  cwd: string
  command: string
  args: string[]
  ports: number[] // for status (running if any is listening) and stop (kill holders)
  updateCommand?: string // run before launch when 'update' is requested (e.g. 'git pull')
}

export type ManagedAppInput = Omit<ManagedApp, 'id'>

export interface AppStatus {
  id: string
  running: boolean
  busy: boolean
}

export interface AppActionResult {
  ok: boolean
  error?: string
}

export interface AppOutputEvent {
  id: string
  data: string
}

export interface AppExitEvent {
  id: string
  exitCode: number | null
}

export type AddWorkspaceResult = { ok: true; workspace: Workspace } | { ok: false; error: string }

export interface UpdateStatus {
  /** The running app's version. */
  version: string
  /** Epoch ms of the last finished check; null before the first. */
  lastCheck: number | null
  checking: boolean
  /** A downloaded version waiting for a restart. */
  downloaded: string | null
  /** The last check's failure, cleared by the next good one. */
  error: string | null
  /** This launch follows a restart to update. */
  afterUpdate: boolean
  /** Restart by itself to install once nothing has been busy for a while; off waits for a click or the next quit. */
  autoRestart: boolean
}

export type RestartReply = { kind: 'none' } | { kind: 'restart' } | { kind: 'confirm'; busy: string[] }

/** How a legacy chat history import ended: saved, or not chat history at all (nothing saved). */
export type LegacyImport = 'imported' | 'unreadable'

export interface RendererApi {
  workspaces: {
    list: () => Promise<Workspace[]>
    add: () => Promise<Workspace | null>
    /** Adds a folder without a dialog; main checks it exists and is a directory. */
    addPath: (path: string) => Promise<AddWorkspaceResult>
    remove: (id: string) => Promise<void>
    setProfile: (id: string, profileId: string) => Promise<Workspace | null>
    /** Saves this order; ids it leaves out keep their place after the ones it names. */
    reorder: (ids: string[]) => Promise<Workspace[]>
  }
  features: {
    list: () => Promise<FeatureRecord[]>
    /** Makes the worktree, its workspace and the record; the caller then starts the feature session under `request.sessionId`. */
    create: (request: NewFeatureRequest) => Promise<NewFeatureResult>
    /** The checks a start makes first, with nothing made; the proposal card shows a failure's message before Go. */
    preflight: (request: PreflightRequest) => Promise<PreflightResult>
    /** Undoes a created feature whose session could not start; resolves with what the undo could not remove. */
    discard: (name: string, workspaceId: string) => Promise<string[]>
    /** Each feature's stage by name, read from its files. */
    stages: () => Promise<Record<string, FeatureStageView>>
    /** Keeps the feature session's Claude id on its record, so the session can be resumed once its chat is gone. */
    setClaudeSession: (name: string, claudeSessionId: string) => Promise<void>
    onStagesChanged: (cb: (stages: Record<string, FeatureStageView>) => void) => () => void
    /** Told while New feature's install command runs (true) and when it ends (false), by feature name. */
    onInstalling: (cb: (name: string, running: boolean) => void) => () => void
    /** The Test button: boots the servers, then opens the test pair once every one is Ready (or only the test flow without a preview config); an open pair is brought to the front. Resolves once the windows are open, or with why not. */
    test: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>
    /** Complete: stops the servers, closes the pair and its browser store, frees the ports and marks the feature Completed; the worktree and branch stay. */
    complete: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>
    /** Returns a completed feature to its stage with fresh ports. */
    reopen: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>
    /** Removes a completed feature's worktree; refused while its branch has commits the main branch lacks. */
    removeWorktree: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>
    /** Boots the feature's servers from its preview config on its own ports; resolves once they are launched, not ready. */
    startServers: (name: string) => Promise<{ ok: true; note?: string } | { ok: false; error: string }>
    /** Runs one server again, e.g. after it Failed. */
    retryServer: (name: string, server: string) => Promise<{ ok: true; note?: string } | { ok: false; error: string }>
    /** Stops the feature's servers; it keeps its ports. */
    stopServers: (name: string) => Promise<void>
    /** Every started feature's servers by feature name. */
    servers: () => Promise<Record<string, FeatureServersView>>
    onServersChanged: (cb: (name: string, view: FeatureServersView) => void) => () => void
  }
  mainChat: {
    /** Makes the main chat's folder and workspace record when missing, and says how to host it. */
    info: () => Promise<MainChatInfo>
    /** Chooses the account the main chat runs on; its conversation starts afresh, since the old one lives in the old account's folder. */
    setProfile: (profileId: string) => Promise<MainChatInfo>
    setClaudeSession: (claudeSessionId: string) => Promise<void>
    /** Forgets the conversation so the next start is fresh; after a Go, names the feature it started. The account stays. */
    reset: (justStarted?: JustStarted) => Promise<MainChatInfo>
  }
  previewConfig: {
    /** The workspace's saved preview config; null when it has none (no browser, only the test flow). */
    get: (workspaceId: string) => Promise<PreviewConfig | null>
    /** Validates, then saves; an empty config removes the entry. The refusal names the field. */
    save: (workspaceId: string, config: unknown) => Promise<{ ok: true; config: PreviewConfig | null } | { ok: false; error: string }>
    /** Names a fresh draft file in the app's data folder for a Set up preview session to write; writes nothing. */
    draftBegin: () => Promise<{ ok: true; file: string } | { ok: false; error: string }>
    /** What Claude has written to the draft file: waiting until it holds JSON, then a validated config, the no-browser outcome, or a refusal with its reason. */
    draftRead: (file: string) => Promise<PreviewDraftRead>
    /** Removes a draft file once read or given up on. */
    draftDiscard: (file: string) => Promise<void>
  }
  sidebarGroups: {
    /** null before the first save: the list then seeds one from its repo groups. */
    load: () => Promise<SidebarLayout | null>
    save: (layout: SidebarLayout) => Promise<void>
  }
  /** Hosted sessions' chat history, one file per session saved by main. */
  chatHistory: {
    /** Blocks the window until read, so the first frame has every chat's history. */
    loadSync: () => Record<string, ChatItem[]>
    /** Fire and forget; main writes one session's changes in the order sent. */
    apply: (paneId: string, changes: HistoryChange[]) => void
    /** Saves the legacy localStorage entry's sessions that have no file yet; rejects when a write fails. */
    importLegacy: (entry: string) => Promise<LegacyImport>
  }
  repoIdentities: {
    list: () => Promise<RepoIdentityViews>
    setDisplayName: (repoGroupKey: string, name: string) => Promise<RepoIdentityViews>
    /** undefined goes back to the automatic icon. */
    setIcon: (repoGroupKey: string, icon: RepoIconRequest) => Promise<RepoIdentityViews>
    /** Opens a file dialog; null when cancelled. */
    chooseImage: (repoGroupKey: string) => Promise<ChooseImageResult | null>
    /** Hands main the icon drawn as a PNG data URL, for notifications. */
    setRendered: (repoGroupKey: string, pngDataUrl: string) => void
    /** Searches the repo for icons again; the user's own icon stays. */
    detect: (repoGroupKey: string) => Promise<RepoIdentityViews>
    /** After a search in the background. */
    onChanged: (cb: (identities: RepoIdentityViews) => void) => () => void
  }
  profiles: {
    list: () => Promise<AccountProfile[]>
    create: (name: string) => Promise<AccountProfile>
    rename: (id: string, name: string) => Promise<AccountProfile | null>
    /** CLAUDE_CONFIG_DIR folders found in VS Code profiles that no profile uses yet. */
    suggestions: () => Promise<VsCodeConfigDir[]>
    adopt: (path: string) => Promise<AdoptResult>
    /** Opens a folder picker and adopts the pick; null when cancelled. */
    chooseFolder: () => Promise<AdoptResult | null>
    /** Forgets the profile; never deletes its folder. */
    remove: (id: string) => Promise<boolean>
  }
  vscodeMatch: {
    get: () => Promise<VsCodeMatch>
    dismiss: (keys: string[]) => Promise<void>
    dismissNotice: () => Promise<void>
    /** Moves these workspaces onto the accounts VS Code uses for them; open chats keep theirs. */
    apply: (workspaceIds: string[]) => Promise<UseVsCodeAccountsResult>
  }
  usage: {
    list: () => Promise<ProfileUsage[]>
    /** Fetches now: one profile, or every profile when none is given. */
    refresh: (profileId?: string) => void
    onChanged: (cb: (all: ProfileUsage[]) => void) => () => void
  }
  board: {
    get: () => Promise<BoardModel>
    onChanged: (cb: (model: BoardModel) => void) => () => void
    /** Reads a ticket, ticket notes, spec or progress file named in the current model; null for any other path. */
    readFile: (path: string) => Promise<string | null>
  }
  context: {
    /** Read from disk on every call; null for an unknown workspace. */
    report: (workspaceId: string) => Promise<ContextReport | null>
    /** By workspace id; null where the folder is gone. */
    startTotals: () => Promise<Record<string, number | null>>
    /** A file the workspace's latest report listed, or a creatable one it marked missing (read as empty). */
    readFile: (workspaceId: string, path: string) => Promise<ContextFileText>
    /** Guarded: only what the latest report listed and didn't mark read-only, or a missing creatable file; a `.json` file must parse. */
    writeFile: (workspaceId: string, path: string, content: string) => Promise<ContextFileResult>
  }
  claudeSettings: {
    /**
     * The account's settings.json, with a workspace its repo and local settings files, and the organisation's settings, read from disk.
     * Until the next read or `unwatch`, main watches these files and calls `onChanged` when one's text changes.
     */
    read: (profileId: string, workspaceId: string | null) => Promise<ClaudeSettingsRead>
    /** Writes the patch onto the file as it is on disk (ADR 0007); only account and workspace settings files are allowed. */
    save: (path: string, base: SettingsObject, patch: SettingsPatch) => Promise<SettingsSaveResult>
    unwatch: () => void
    onChanged: (cb: (change: SettingsFileChange) => void) => () => void
  }
  driftChecks: {
    /**
     * The latest drift checks covering the workspace (ADR 0005). `live` holds the session ids that can still finish a
     * run: a run not done whose session is not in it shows as stopped, and is removed while it is a bare skeleton. Until
     * the next call or `release`, main watches the shown run files still running, and those in `fixing` (run ids fixes
     * were sent to), and calls `onChanged` when one is rewritten.
     */
    show: (workspaceId: string, fixing: string[], live: string[]) => Promise<DriftChecksView>
    release: () => Promise<void>
    onChanged: (cb: () => void) => () => void
    /** Writes a new run's skeleton as `<runId>.json` in the drift-checks folder; never overwrites a file. */
    begin: (skeleton: FindingsRun) => Promise<SkeletonResult>
    /** Removes a run file whose session never started, while it is still the bare skeleton. */
    discard: (file: string) => Promise<void>
  }
  discovery: {
    get: () => Promise<DiscoveryModel>
    onChanged: (cb: (model: DiscoveryModel) => void) => () => void
    rescan: () => Promise<DiscoveryModel>
    setRoots: (roots: string[]) => Promise<DiscoveryModel>
  }
  apps: {
    list: () => Promise<ManagedApp[]>
    add: (app: ManagedAppInput) => Promise<ManagedApp>
    remove: (id: string) => Promise<void>
    start: (id: string, update?: boolean) => Promise<AppActionResult>
    stop: (id: string) => Promise<AppActionResult>
    status: () => Promise<AppStatus[]>
    onOutput: (cb: (event: AppOutputEvent) => void) => () => void
    onExit: (cb: (event: AppExitEvent) => void) => () => void
  }
  /** The terminal pool in main (ADR 0006); views attach to replay a terminal's tail, then follow `onData`. */
  terminals: {
    list: () => Promise<TerminalInfo[]>
    create: (request: CreateTerminalRequest) => Promise<CreateTerminalResult>
    /** Null for an id the pool doesn't have. */
    attach: (id: string) => Promise<TerminalAttachment | null>
    write: (id: string, data: string) => void
    resize: (id: string, cols: number, rows: number) => void
    rename: (id: string, label: string) => void
    restart: (id: string) => Promise<CreateTerminalResult>
    /** Kills the terminal's process tree; it stays listed as exited, with its output. */
    stop: (id: string) => Promise<void>
    /** Kills the terminal's process tree and removes it from the pool. */
    close: (id: string) => void
    onChanged: (cb: (list: TerminalInfo[]) => void) => () => void
    onData: (cb: (event: TerminalDataEvent) => void) => () => void
  }
  video: {
    /** The file's path on disk, or '' for a pasted file that has none. */
    pathOf: (file: File) => string
    /** Probes the video and builds its contact sheets in a temp folder; progress comes as `onProgress`. */
    prepare: (jobId: string, source: VideoSource) => Promise<VideoFramesResult>
    /** The speech of a prepared video, once the speech model is downloaded. */
    transcribe: (jobId: string) => Promise<VideoTranscriptResult>
    /** Stops the job and deletes its temp folder: after sending, or when the chip is removed. */
    release: (jobId: string) => Promise<void>
    onProgress: (cb: (event: VideoProgressEvent) => void) => () => void
    modelStatus: () => Promise<SpeechModelStatus>
    downloadModel: () => Promise<SpeechModelStatus>
    cancelModelDownload: () => Promise<void>
    removeModel: () => Promise<SpeechModelStatus>
    onModelChanged: (cb: (status: SpeechModelStatus) => void) => () => void
  }
  testFlow: {
    /**
     * What `watcher` shows for the finder's candidates: the first that exists; anything outside the test-flows folder is
     * refused. Main watches the shown file and the newer candidates until the next call or `release`.
     */
    show: (watcher: string, paths: readonly string[]) => Promise<TestFlowView>
    release: (watcher: string) => Promise<void>
    /** Called with the watcher whose shown or awaited file changed on disk. */
    onChanged: (cb: (watcher: string) => void) => () => void
    folder: () => Promise<string>
    /** Resolves to the folder in force; a path that is not absolute is not saved. */
    setFolder: (folder: string) => Promise<string>
    /** Opens the pop-out test-flow window, or brings it to the front. */
    popOut: () => Promise<void>
    /** The main window tells main which session's test flow the pop-out follows; other windows are ignored. */
    publish: (focus: TestFlowFocus) => void
    /** The last published focus, null before the first. */
    focus: () => Promise<TestFlowFocus | null>
    onFocus: (cb: (focus: TestFlowFocus) => void) => () => void
    /** A feature's checklist with its marks; main watches the checklist and results file for `watcher` (changes arrive on `onChanged`). Not found outside the test-flows folder. */
    showSteps: (watcher: string, path: string) => Promise<StepsView>
    /** Sets (or with null clears) one step's mark and a Fail's note in the results file; resolves to the checklist as it now stands. */
    markStep: (path: string, hash: string, mark: Mark | null, note: string) => Promise<StepsView>
  }
  files: {
    /** Where a file link in a chat points, or null when nothing is there. */
    resolveLink: (cwd: string, path: string) => Promise<LinkedPath | null>
    readImage: (path: string) => Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }>
    /** Opens an existing file or folder in its system app; resolves to an error message, '' on success. */
    openWithSystem: (path: string) => Promise<string>
    /** Each path a chat named, as the media panel loads it; nothing is written. */
    resolveMedia: (cwd: string, paths: readonly string[]) => Promise<MediaFile[]>
    revealMedia: (path: string) => Promise<void>
    list: (cwd: string) => Promise<string[]>
    /** The @ menu's rows for the text typed after `@`: ripgrep's listing, fuzzy-ranked. */
    mentions: (cwd: string, query: string) => Promise<MentionEntry[]>
    saveAs: (
      suggestedName: string,
      content: string
    ) => Promise<{ saved: boolean; path?: string }>
    read: (
      cwd: string,
      relativePath: string
    ) => Promise<{ ok: boolean; content?: string; binary?: boolean; size?: number; error?: string }>
    write: (
      cwd: string,
      relativePath: string,
      content: string
    ) => Promise<{ ok: boolean; error?: string }>
  }
  claude: {
    start: (options: ClaudeStartOptions) => Promise<ClaudeStartResult>
    /** The profile the pane's running process was started on; null when none runs. */
    processProfile: (paneId: string) => Promise<string | null>
    control: (paneId: string, subtype: string, fields?: Record<string, unknown>) => Promise<ControlResult>
    getInit: (paneId: string) => Promise<SessionInit | null>
    /** The model defaults in the profile's own settings.json, as its CLI reads them. */
    readDefaults: (profileId: string) => Promise<ModelDefaults>
    /** `permissions.defaultMode` from the user settings of the profile the workspace at `cwd` runs on; null when unset. */
    defaultPermissionMode: (cwd: string) => Promise<string | null>
    saveDefaults: (patch: ModelDefaultsPatch) => Promise<SaveDefaultsResult>
    onInit: (cb: (envelope: SessionInitEnvelope) => void) => () => void
    /** `uuid` names the prompt in the CLI's `command_lifecycle` frames and replay echo. */
    send: (paneId: string, content: UserContentBlock[], uuid: string) => void
    interrupt: (paneId: string) => void
    stop: (paneId: string) => void
    onEvent: (cb: (envelope: ClaudeEventEnvelope) => void) => () => void
    onExit: (cb: (envelope: ClaudeExitEnvelope) => void) => () => void
    listLocalSessions: (cwd: string) => Promise<LocalSessionInfo[]>
    /** Tells the pane's CLI (`rename_session`), or with no process appends a `custom-title` line to the transcript. */
    renameSession: (rename: SessionRename) => Promise<RenameResult>
  }
  subagents: {
    /** Follows the session's `subagents/` files, each agent's summary arriving through `onItems`; watching again starts over. */
    watch: (source: SubagentSource) => void
    unwatch: (source: SubagentSource) => void
    /** Sends one agent's items through `onItems`, then its new ones until `close`; its session must be watched. */
    open: (target: SubagentItemsSource) => void
    close: (target: SubagentItemsSource) => void
    onItems: (cb: (event: SubagentTailEvent) => void) => () => void
  }
  observed: {
    list: () => Promise<ObservedSession[]>
    onChanged: (cb: (sessions: ObservedSession[]) => void) => () => void
    /** The app's own sessions' claude ids; their transcripts are never listed as observed. */
    setHosted: (sessionIds: string[]) => void
    /** Returns the last items and starts tailing; any session opened before stops being tailed. */
    open: (workspaceId: string, sessionId: string) => Promise<ObservedOpenResult>
    close: () => void
    onItems: (cb: (event: ObservedItemsEvent) => void) => () => void
    /** Where VS Code's agent is in its turn, from the transcript and the CLI's process record. */
    turn: (workspaceId: string, sessionId: string) => Promise<ObservedTurn>
    /** The last items, read once without following. */
    read: (workspaceId: string, sessionId: string) => Promise<ObservedOpenResult>
    /** An image a prompt carried, as a data URL, read again from its transcript line. */
    image: (workspaceId: string, sessionId: string, uuid: string, block: number) => Promise<string | null>
    /** The config folder whose `sessions/<pid>.json` holds the session with a live process; null when none does. */
    liveConfigDir: (sessionId: string) => Promise<string | null>
    /** How often to read `liveConfigDir` and the session list again, in ms. */
    refreshMs: number
  }
  approval: {
    list: () => Promise<ApprovalRequest[]>
    onRequest: (cb: (request: ApprovalRequest) => void) => () => void
    onSettled: (cb: (settled: ApprovalSettled) => void) => () => void
    respond: (requestId: string, reply: ApprovalReply) => void
  }
  sessionStatus: {
    list: () => Promise<SessionStatusEntry[]>
    onChanged: (cb: (entry: SessionStatusEntry) => void) => () => void
    reportScreenFocus: (focus: ScreenFocus) => void
  }
  backgroundProcesses: {
    list: () => Promise<BackgroundProcessesEntry[]>
    onChanged: (cb: (entry: BackgroundProcessesEntry) => void) => () => void
    /** Whether something answers on `127.0.0.1:<port>`. */
    portOpen: (port: number) => Promise<boolean>
    /** Opens a local address in the default browser; anything else is refused. The error, or null. */
    openInBrowser: (url: string) => Promise<string | null>
  }
  startWithWindows: {
    get: () => Promise<StartWithWindowsState>
    set: (checked: boolean) => Promise<StartWithWindowsState>
    onChanged: (cb: (state: StartWithWindowsState) => void) => () => void
  }
  /** The whole window's zoom level (Chromium levels, 1.2^level); main keeps it across restarts. */
  zoom: {
    get: () => Promise<number>
    step: (step: ZoomStep) => Promise<number>
    onChanged: (cb: (level: number) => void) => () => void
  }
  /** Requests from main (tray menu, notification clicks) to bring something on screen. */
  navigation: {
    onShowView: (cb: (view: AppView) => void) => () => void
    onOpenSession: (cb: (paneId: string) => void) => () => void
    onOpenApprovals: (cb: (paneId: string) => void) => () => void
  }
  git: {
    status: (cwd: string) => Promise<GitStatusResult>
    diff: (
      cwd: string,
      path: string,
      staged: boolean,
      untracked?: boolean
    ) => Promise<GitDiffResult>
  }
  update: {
    status: () => Promise<UpdateStatus>
    check: () => Promise<void>
    /** Restart to update; `force` answers the busy question. */
    restart: (force: boolean) => Promise<RestartReply>
    setAutoRestart: (on: boolean) => Promise<void>
    onChanged: (cb: (status: UpdateStatus) => void) => () => void
  }
}

export type BoardColumn = 'backlog' | 'blocked' | 'in-progress' | 'done'

/** What a ticket's Status line says. */
export interface TicketStatus {
  /** Lower-cased first word of the Status line; null when the ticket has none. */
  status: string | null
  /** Text after the word, without a leading em dash. */
  statusNote: string | null
  /** The whole Status value as written, for the unknown-status badge. */
  statusLine: string | null
  /** False when the word is neither a lifecycle word nor a legacy one; a missing status counts as known. */
  statusKnown: boolean
}

/** One copy of a ticket file, in one workspace. */
export interface TicketSighting extends TicketStatus {
  /** An added workspace's id, or `worktree:<path>` for a worktree that isn't added. */
  workspaceId: string
  /** Empty for a main checkout; a branch or folder name otherwise. */
  worktreeTag: string
  column: BoardColumn
  blockedBy: TicketNumber[]
  filePath: string
  progressPath: string | null
}

/** At least two digits plus an optional lower-case letter suffix: "02", "02b", "112". */
export type TicketNumber = string

/** One card: every worktree copy of one ticket, merged. */
export interface BoardTicket extends TicketStatus {
  number: TicketNumber
  /** Lower-cased ticket file name; copies merge on it, so two files sharing a number stay two cards. */
  fileName: string
  title: string
  /** The ticket's "What to build" text, else its first paragraph, as plain text; null when it has neither. */
  summary: string | null
  column: BoardColumn
  /** The copy that decides the status first (most advanced, main checkout on a tie), then the rest by the same order. */
  sightings: TicketSighting[]
}

export interface FeatureSighting {
  /** An added workspace's id, or `worktree:<path>` for a worktree that isn't added. */
  workspaceId: string
  /** Empty for a main checkout; a branch or folder name otherwise. */
  worktreeTag: string
  specPath: string | null
  progressPath: string | null
  /** Newest modification time (epoch ms) of this copy's spec, progress notes, tickets and ticket notes. */
  lastActivity: number | null
}

export type FeatureState = 'active' | 'finished' | 'spec-only' | 'empty'

export interface FeatureProgress {
  done: number
  total: number
  /** Last non-empty line of the fullest worktree copy of progress.md. */
  lastNote: string | null
}

export interface BoardFeature {
  name: string
  state: FeatureState
  progress: FeatureProgress
  /** Newest lastActivity across the feature's worktree copies. */
  lastActivity: number | null
  tickets: BoardTicket[]
  sightings: FeatureSighting[]
}

export interface BoardRepoGroup {
  repoGroupKey: string
  repoName: string
  features: BoardFeature[]
}

export interface BoardModel {
  repoGroups: BoardRepoGroup[]
}

/** A repo folder with tickets that isn't an added workspace. */
export interface DiscoveredFolder {
  path: string
  /** Empty for the main checkout. */
  worktreeTag: string
  featureCount: number
  openTicketCount: number
}

export interface DiscoveredRepo {
  repoGroupKey: string
  repoName: string
  /** Null when the main checkout is added already or holds no tickets. */
  main: DiscoveredFolder | null
  mainAdded: boolean
  worktrees: DiscoveredFolder[]
  /** Over the main checkout and worktrees listed here, with worktree copies merged as on the board. */
  featureCount: number
  openTicketCount: number
}

export interface DiscoveryModel {
  scanRoots: string[]
  repos: DiscoveredRepo[]
  /** Epoch ms of the last finished scan; null before the first one. */
  scannedAt: number | null
  scanMs: number | null
  /** Why the last scan failed; null when it worked. */
  error: string | null
}

export type ObservedStatus = 'live' | 'quiet'

export const OBSERVED_STATUS_LABEL: Record<ObservedStatus, string> = { live: 'Live', quiet: 'Quiet' }

export interface ObservedSession {
  workspaceId: string
  sessionId: string
  title: string
  modifiedAt: number
  status: ObservedStatus
}

/** Opening an observed session renders at most this many of its latest chat items. */
export const OBSERVED_INITIAL_ITEMS = 200

export interface ObservedItemsEvent {
  workspaceId: string
  sessionId: string
  items: ChatItem[]
}

export type ObservedOpenResult =
  | { ok: true; items: ChatItem[]; shortened: boolean }
  | { ok: false; error: string }

export interface UsageWindowReading {
  /** Percent of the window used, 0-100. */
  utilization: number
  /** Epoch ms. */
  resetsAt: number | null
}

/** One account profile's plan limits, as the usage service last read them. */
export interface ProfileUsage {
  profileId: string
  loggedIn: boolean
  account: { email?: string; organization?: string; subscriptionType?: string } | null
  /** Absent when the CLI reported the window as null. */
  fiveHour?: UsageWindowReading
  sevenDay?: UsageWindowReading
  /** Epoch ms of the last successful read; null before the first. */
  updatedAt: number | null
  refreshing: boolean
  error?: string
}

/** A file link resolved on disk: its absolute path, and its path in the workspace when it lies inside. */
export interface LinkedPath {
  path: string
  relative: string | null
}
