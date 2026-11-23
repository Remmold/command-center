import { promises as fs, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { subagentSourceKey, type SubagentMeta, type SubagentSource, type SubagentTailEvent } from '../../shared/subagentTail'
import { POLL_MS, readLastItems, TranscriptFollower } from '../observed/tail'

const AGENT_FILE = /^agent-([A-Za-z0-9_-]{1,128})\.jsonl$/
const INITIAL_ITEMS = 400
const INITIAL_MAX_BYTES = 8 * 1024 * 1024

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

async function readMeta(dir: string, agentId: string): Promise<SubagentMeta> {
  try {
    const raw = JSON.parse(await fs.readFile(join(dir, `agent-${agentId}.meta.json`), 'utf-8')) as Record<string, unknown>
    const meta: SubagentMeta = { agentId }
    const agentType = str(raw.agentType)
    const description = str(raw.description)
    const toolUseId = str(raw.toolUseId)
    if (agentType) meta.agentType = agentType
    if (description) meta.description = description
    if (toolUseId) meta.toolUseId = toolUseId
    return meta
  } catch {
    return { agentId }
  }
}

/** Follows every `agent-<id>.jsonl` in one session's `subagents/` folder, files that appear later included. */
export class SubagentWatcher {
  private followers = new Map<string, TranscriptFollower>()
  private dirWatcher: FSWatcher | null = null
  private poll: NodeJS.Timeout | null = null
  private scanning: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(
    private readonly dir: string,
    private readonly key: string,
    private readonly emit: (event: SubagentTailEvent) => void,
    private readonly pollMs = POLL_MS
  ) {}

  start(): void {
    this.schedule()
    this.poll = setInterval(() => this.schedule(), this.pollMs)
  }

  stop(): void {
    this.stopped = true
    if (this.poll) clearInterval(this.poll)
    this.poll = null
    this.dirWatcher?.close()
    this.dirWatcher = null
    for (const f of this.followers.values()) f.stop()
    this.followers.clear()
  }

  private schedule(): void {
    this.scanning = this.scanning.then(() => this.scan()).catch((err) => console.error('[subagents] scan failed', err))
  }

  private async scan(): Promise<void> {
    if (this.stopped) return
    let names: string[]
    try {
      names = await fs.readdir(this.dir)
    } catch {
      return
    }
    this.watchDir()
    for (const name of names) {
      const agentId = AGENT_FILE.exec(name)?.[1]
      if (!agentId || this.followers.has(agentId) || this.stopped) continue
      await this.add(agentId)
    }
  }

  private watchDir(): void {
    if (this.dirWatcher || this.stopped) return
    try {
      this.dirWatcher = watch(this.dir, () => this.schedule())
      this.dirWatcher.on('error', () => {
        this.dirWatcher?.close()
        this.dirWatcher = null
      })
    } catch {
      this.dirWatcher = null
    }
  }

  private async add(agentId: string): Promise<void> {
    const file = join(this.dir, `agent-${agentId}.jsonl`)
    const meta = await readMeta(this.dir, agentId)
    let tail
    try {
      tail = await readLastItems(file, INITIAL_ITEMS, INITIAL_MAX_BYTES, true)
    } catch {
      return
    }
    if (this.stopped || this.followers.has(agentId)) return
    this.emit({ key: this.key, agentId, meta, items: tail.items, reset: true })
    const follower = new TranscriptFollower(file, tail.offset, (items) => this.emit({ key: this.key, agentId, meta, items }), true)
    this.followers.set(agentId, follower)
  }
}

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/

function asSource(v: unknown): SubagentSource | null {
  if (!v || typeof v !== 'object') return null
  const { cwd, sessionId } = v as Record<string, unknown>
  return typeof cwd === 'string' && cwd !== '' && typeof sessionId === 'string' && SESSION_ID.test(sessionId) ? { cwd, sessionId } : null
}

/** One watcher per followed session; the renderer counts its own users, so a second watch means it lost its copy and starts over. */
export class SubagentWatchService {
  private watchers = new Map<string, SubagentWatcher>()
  /** Watches still looking up their folder, by the generation that started them. */
  private pending = new Map<string, number>()
  private generation = 0

  constructor(
    private readonly transcriptsDirFor: (cwd: string) => Promise<string>,
    private readonly emit: (event: SubagentTailEvent) => void
  ) {}

  async watch(raw: unknown): Promise<void> {
    const source = asSource(raw)
    if (!source) return
    const key = subagentSourceKey(source)
    this.drop(key)
    const generation = ++this.generation
    this.pending.set(key, generation)
    const dir = join(await this.transcriptsDirFor(source.cwd), source.sessionId, 'subagents')
    // An unwatch, or a newer watch, arrived while the folder was looked up.
    if (this.pending.get(key) !== generation) return
    this.pending.delete(key)
    const watcher = new SubagentWatcher(dir, key, this.emit)
    this.watchers.set(key, watcher)
    watcher.start()
  }

  unwatch(raw: unknown): void {
    const source = asSource(raw)
    if (source) this.drop(subagentSourceKey(source))
  }

  private drop(key: string): void {
    this.pending.delete(key)
    this.watchers.get(key)?.stop()
    this.watchers.delete(key)
  }

  stopAll(): void {
    this.pending.clear()
    for (const w of this.watchers.values()) w.stop()
    this.watchers.clear()
  }
}
