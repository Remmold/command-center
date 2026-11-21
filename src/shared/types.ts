import type { ChatItem } from './chatItems'
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
}

export type SessionStatus = 'running' | 'needs-approval' | 'your-turn' | 'idle'

export const WAITING_STATUSES: readonly SessionStatus[] = ['needs-approval', 'your-turn']

export interface SessionStatusEntry {
  paneId: string
  cwd: string
  status: SessionStatus
  /** Epoch ms when the current status began. */
  since: number
}

export type AppView = 'sessions' | 'board'

/** What the renderer has on screen, reported to main for notifications. */
export interface ScreenFocus {
  paneId: string | null
  windowVisible: boolean
}

export type PtyKind = 'pwsh' | 'powershell' | 'cmd' | 'bash'

export interface SpawnResult {
  ok: boolean
  error?: string
}

export interface PtyDataEvent {
  paneId: string
  data: string
}

export interface PtyExitEvent {
  paneId: string
  exitCode: number
  signal: number | null
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

export interface ImageAttachment {
  media_type: string
  data: string
}

export interface PermissionRequest {
  requestId: string
  paneId: string
  toolName: string
  toolInput: unknown
  sessionId?: string
}

export interface PermissionResponse {
  decision: 'approve' | 'block'
  reason?: string
  modifiedInput?: unknown
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

export interface LocalSessionInfo {
  sessionId: string
  modifiedAt: number
  preview: string
  messageCount: number
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

export interface RendererApi {
  workspaces: {
    list: () => Promise<Workspace[]>
    add: () => Promise<Workspace | null>
    remove: (id: string) => Promise<void>
    setProfile: (id: string, profileId: string) => Promise<Workspace | null>
  }
  profiles: {
    list: () => Promise<AccountProfile[]>
    create: (name: string) => Promise<AccountProfile>
    rename: (id: string, name: string) => Promise<AccountProfile | null>
  }
  board: {
    get: () => Promise<BoardModel>
    onChanged: (cb: (model: BoardModel) => void) => () => void
    /** Reads a ticket, ticket notes, spec or progress file named in the current model; null for any other path. */
    readFile: (path: string) => Promise<string | null>
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
  pty: {
    /** `env` adds variables on top of the app's cleaned environment. */
    spawn: (
      paneId: string,
      kind: PtyKind,
      cwd: string,
      env?: Record<string, string>
    ) => Promise<SpawnResult>
    write: (paneId: string, data: string) => void
    resize: (paneId: string, cols: number, rows: number) => void
    kill: (paneId: string) => void
    onData: (cb: (event: PtyDataEvent) => void) => () => void
    onExit: (cb: (event: PtyExitEvent) => void) => () => void
  }
  files: {
    list: (cwd: string) => Promise<string[]>
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
    start: (
      paneId: string,
      cwd: string,
      model?: string,
      resumeSessionId?: string,
      permissionMode?: string
    ) => Promise<SpawnResult>
    send: (paneId: string, text: string, images?: ImageAttachment[]) => void
    interrupt: (paneId: string) => void
    stop: (paneId: string) => void
    onEvent: (cb: (envelope: ClaudeEventEnvelope) => void) => () => void
    onExit: (cb: (envelope: ClaudeExitEnvelope) => void) => () => void
    listLocalSessions: (cwd: string) => Promise<LocalSessionInfo[]>
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
  }
  permission: {
    onRequest: (cb: (request: PermissionRequest) => void) => () => void
    respond: (
      requestId: string,
      response: PermissionResponse,
      allowForSession?: boolean
    ) => void
  }
  sessionStatus: {
    list: () => Promise<SessionStatusEntry[]>
    onChanged: (cb: (entry: SessionStatusEntry) => void) => () => void
    reportScreenFocus: (focus: ScreenFocus) => void
  }
  /** Requests from main (tray menu, notification clicks) to bring something on screen. */
  navigation: {
    onShowView: (cb: (view: AppView) => void) => () => void
    onOpenSession: (cb: (paneId: string) => void) => () => void
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
}

export type BoardColumn = 'backlog' | 'blocked' | 'in-progress' | 'done'

/** One copy of a ticket file, in one workspace. */
export interface TicketSighting {
  workspaceId: string
  column: BoardColumn
  /** Lower-cased first word of the Status line; null when the ticket has none. */
  status: string | null
  blockedBy: TicketNumber[]
  filePath: string
  progressPath: string | null
}

/** At least two digits plus an optional lower-case letter suffix: "02", "02b", "112". */
export type TicketNumber = string

/** One card: every worktree copy of one ticket, merged. */
export interface BoardTicket {
  number: TicketNumber
  /** Lower-cased ticket file name; copies merge on it, so two files sharing a number stay two cards. */
  fileName: string
  title: string
  column: BoardColumn
  status: string | null
  /** Highest column first, then workspace order. */
  sightings: TicketSighting[]
}

export interface FeatureSighting {
  workspaceId: string
  specPath: string | null
  progressPath: string | null
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

/** An observed session is only ever Live or Quiet. */
export type ObservedState = 'live' | 'quiet'

export interface ObservedSession {
  workspaceId: string
  sessionId: string
  title: string
  modifiedAt: number
  state: ObservedState
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
