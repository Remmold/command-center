import { join } from 'node:path'
import type { ChatItem } from '../../shared/chatItems'
import {
  OBSERVED_INITIAL_ITEMS,
  type ObservedItemsEvent,
  type ObservedOpenResult,
  type ObservedSession,
  type Workspace
} from '../../shared/types'
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
          const dir = await this.transcriptsDirFor(workspace)
          const listed = await listObservedTranscripts(dir, { hostedSessionIds: this.hosted, now })
          for (const t of listed) next.push({ workspaceId: workspace.id, ...t })
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

  /** Starts following one transcript, stopping any other; only one is tailed at a time. */
  async open(workspaceId: string, sessionId: string): Promise<ObservedOpenResult> {
    this.close()
    const seq = this.openSeq
    if (!SESSION_ID_RE.test(sessionId)) return { ok: false, error: 'not a session id' }
    const workspace = (await this.listWorkspaces()).find((w) => w.id === workspaceId)
    if (!workspace) return { ok: false, error: 'unknown workspace' }
    const file = join(await this.transcriptsDirFor(workspace), `${sessionId}.jsonl`)
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
