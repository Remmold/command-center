import { dirname, join } from 'node:path'
import type { ChatItem } from '../../shared/chatItems'
import {
  OBSERVED_INITIAL_ITEMS,
  type ObservedItemsEvent,
  type ObservedOpenResult,
  type ObservedSession,
  type Workspace
} from '../../shared/types'
import type { ObservedTurn } from '../../shared/takeOver'
import { readTurn } from './turn'
import { listObservedTranscripts } from './listing'
import { readLastItems, TranscriptFollower } from './tail'

const REFRESH_MS = 10_000
const INITIAL_MAX_BYTES = 8 * 1024 * 1024
const SESSION_ID_RE = /^[\w-]+$/

interface Viewing {
  workspaceId: string
  sessionId: string
  follower: TranscriptFollower
}

export class ObservedService {
  private sessions: ObservedSession[] = []
  private lastJson = '[]'
  private hosted = new Set<string>()
  private timer: NodeJS.Timeout | null = null
  private refreshing: Promise<void> = Promise.resolve()
  private viewing: Viewing | null = null
  private openSeq = 0
  private workspaces: Workspace[] | null = null

  constructor(
    private readonly listWorkspaces: () => Promise<Workspace[]>,
    private readonly transcriptsDirFor: (workspace: Workspace) => Promise<string>,
    private readonly pushSessions: (sessions: ObservedSession[]) => void,
    private readonly pushItems: (event: ObservedItemsEvent) => void
  ) {}

  start(): void {
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.close()
  }

  async list(): Promise<ObservedSession[]> {
    await this.refreshing
    return this.sessions
  }

  /** Call after any workspace is added, removed or moved to another profile. */
  workspacesChanged(): Promise<void> {
    this.workspaces = null
    return this.refresh()
  }

  setHosted(sessionIds: string[]): void {
    this.hosted = new Set(sessionIds)
    void this.refresh()
  }

  refresh(): Promise<void> {
    this.refreshing = this.refreshing.then(async () => {
      try {
        const now = Date.now()
        const next: ObservedSession[] = []
        this.workspaces ??= await this.listWorkspaces()
        for (const workspace of this.workspaces) {
          try {
            const dir = await this.transcriptsDirFor(workspace)
            const listed = await listObservedTranscripts(dir, { hostedSessionIds: this.hosted, now })
            for (const t of listed) next.push({ workspaceId: workspace.id, ...t })
          } catch (err) {
            console.error('[observed] could not list', workspace.path, err)
          }
        }
        this.sessions = next
        const json = JSON.stringify(next)
        if (json !== this.lastJson) {
          this.lastJson = json
          this.pushSessions(next)
        }
      } catch (err) {
        console.error('[observed] refresh failed', err)
      }
    })
    return this.refreshing
  }

  private async transcriptFile(workspaceId: string, sessionId: string): Promise<string | { error: string }> {
    if (!SESSION_ID_RE.test(sessionId)) return { error: 'not a session id' }
    const workspace = (await this.listWorkspaces()).find((w) => w.id === workspaceId)
    if (!workspace) return { error: 'unknown workspace' }
    return join(await this.transcriptsDirFor(workspace), `${sessionId}.jsonl`)
  }

  /** Where VS Code's agent is in its turn; a transcript that cannot be read counts as idle. */
  async turn(workspaceId: string, sessionId: string): Promise<ObservedTurn> {
    const file = await this.transcriptFile(workspaceId, sessionId)
    if (typeof file !== 'string') return 'idle'
    // Transcripts sit in <config>/projects/<cwd>/; the CLI's process records in <config>/sessions/.
    const sessionsDir = join(dirname(dirname(dirname(file))), 'sessions')
    return readTurn(file, sessionsDir, sessionId, Date.now()).catch(() => 'idle' as const)
  }

  /** The last items, read once without following. */
  async items(workspaceId: string, sessionId: string): Promise<ObservedOpenResult> {
    const file = await this.transcriptFile(workspaceId, sessionId)
    if (typeof file !== 'string') return { ok: false, error: file.error }
    try {
      const tail = await readLastItems(file, OBSERVED_INITIAL_ITEMS, INITIAL_MAX_BYTES)
      return { ok: true, items: tail.items, shortened: tail.shortened }
    } catch {
      return { ok: false, error: 'transcript not found' }
    }
  }

  async open(workspaceId: string, sessionId: string): Promise<ObservedOpenResult> {
    this.close()
    const seq = this.openSeq
    const file = await this.transcriptFile(workspaceId, sessionId)
    if (typeof file !== 'string') return { ok: false, error: file.error }
    let tail
    try {
      tail = await readLastItems(file, OBSERVED_INITIAL_ITEMS, INITIAL_MAX_BYTES)
    } catch {
      return { ok: false, error: 'transcript not found' }
    }
    if (seq !== this.openSeq) return { ok: false, error: 'another session was opened' }
    const follower = new TranscriptFollower(file, tail.offset, (items: ChatItem[]) =>
      this.pushItems({ workspaceId, sessionId, items })
    )
    this.viewing = { workspaceId, sessionId, follower }
    return { ok: true, items: tail.items, shortened: tail.shortened }
  }

  close(): void {
    this.openSeq++
    this.viewing?.follower.stop()
    this.viewing = null
  }
}
