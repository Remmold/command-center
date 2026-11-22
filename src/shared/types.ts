import type { BuiltinIconChoice, ChooseImageResult, RepoIdentityViews } from './repoIdentity'
import type { ChatItem } from './chatItems'
import type { AppView } from './views'
import type { ApprovalReply, ApprovalRequest, ApprovalSettled } from './approval'
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

export type AddWorkspaceResult = { ok: true; workspace: Workspace } | { ok: false; error: string }

export interface RendererApi {
  workspaces: {
    list: () => Promise<Workspace[]>
    add: () => Promise<Workspace | null>
    /** Adds a folder without a dialog; main checks it exists and is a directory. */
    addPath: (path: string) => Promise<AddWorkspaceResult>
    remove: (id: string) => Promise<void>
    setProfile: (id: string, profileId: string) => Promise<Workspace | null>
  }
  repoIdentities: {
    list: () => Promise<RepoIdentityViews>
    setDisplayName: (repoGroupKey: string, name: string) => Promise<RepoIdentityViews>
    /** undefined goes back to the letter. */
    setIcon: (repoGroupKey: string, icon: BuiltinIconChoice | undefined) => Promise<RepoIdentityViews>
    /** Opens a file dialog; null when cancelled. */
    chooseImage: (repoGroupKey: string) => Promise<ChooseImageResult | null>
    /** Hands main the icon drawn as a PNG data URL, for notifications. */
    setRendered: (repoGroupKey: string, pngDataUrl: string) => void
  }
  profiles: {
    list: () => Promise<AccountProfile[]>
    create: (name: string) => Promise<AccountProfile>
    rename: (id: string, name: string) => Promise<AccountProfile | null>
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
    start: (options: ClaudeStartOptions) => Promise<SpawnResult>
    control: (paneId: string, subtype: string, fields?: Record<string, unknown>) => Promise<ControlResult>
    getInit: (paneId: string) => Promise<SessionInit | null>
    /** The model and effort new sessions start with, from the user `settings.json`. */
    readDefaults: () => Promise<ModelDefaults>
    saveDefaults: (patch: ModelDefaultsPatch) => Promise<SaveDefaultsResult>
    onInit: (cb: (envelope: SessionInitEnvelope) => void) => () => void
    /** `uuid` names the prompt in the CLI's `command_lifecycle` frames and replay echo. */
    send: (paneId: string, content: UserContentBlock[], uuid: string) => void
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
  startWithWindows: {
    get: () => Promise<StartWithWindowsState>
    set: (checked: boolean) => Promise<StartWithWindowsState>
    onChanged: (cb: (state: StartWithWindowsState) => void) => () => void
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
  workspaceId: string
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
  column: BoardColumn
  /** Highest column first, then workspace order. */
  sightings: TicketSighting[]
}

export interface FeatureSighting {
  workspaceId: string
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
