import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { agentOver, latestOf } from '../../shared/agentEnd'
import type { ChatItem } from '../../shared/chatItems'
import { readLastItems } from '../observed/tail'

/** How often agents still reported working are checked against their files. */
export const SWEEP_MS = 60_000
const TAIL_ITEMS = 40
const TAIL_MAX_BYTES = 2 * 1024 * 1024
const AGENT_END = new Set(['completed', 'failed', 'killed', 'stopped'])

interface PaneAgents {
  cwd: string
  sessionId?: string
  /** Agents the CLI reported started and not yet ended, with their latest task event. */
  agents: Map<string, number>
}

type Ended = (paneId: string, taskId: string) => void

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

async function mtime(file: string): Promise<number | undefined> {
  try {
    return (await fs.stat(file)).mtimeMs
  } catch {
    return undefined
  }
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, 'utf-8'))
    return isRecord(raw) ? raw : undefined
  } catch {
    return undefined
  }
}

/** Every agent below `id`, its agents' agents included. */
function descendants(children: ReadonlyMap<string, string[]>, id: string): string[] {
  const out: string[] = []
  const seen = new Set([id])
  const queue = [id]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of children.get(next) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      out.push(child)
      queue.push(child)
    }
  }
  return out
}

/**
 * Follows the agents each chat's CLI reports as started and checks their own files: one that handed back, was
 * interrupted, or went quiet (with every agent of its own) counts as ended even when the CLI never says so, so it
 * cannot keep the chat Running or the update gate busy for good.
 */
export class AgentSweep {
  private panes = new Map<string, PaneAgents>()
  private listeners: Ended[] = []
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly transcriptsDirFor: (cwd: string) => Promise<string>,
    private readonly now: () => number = () => Date.now()
  ) {}

  start(): void {
    this.timer ??= setInterval(() => void this.sweep().catch((err) => console.error('[agents] sweep failed', err)), SWEEP_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  onEnded(cb: Ended): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((c) => c !== cb)
    }
  }

  spawned(paneId: string, cwd: string): void {
    this.panes.set(paneId, { cwd, agents: new Map() })
  }

  exited(paneId: string): void {
    this.panes.delete(paneId)
  }

  event(paneId: string, line: unknown): void {
    const pane = this.panes.get(paneId)
    if (!pane || !isRecord(line)) return
    if (typeof line.session_id === 'string' && line.session_id !== '') pane.sessionId = line.session_id
    if (line.type !== 'system' || typeof line.task_id !== 'string') return
    const id = line.task_id
    const patch = isRecord(line.patch) ? line.patch : undefined
    if (line.subtype === 'task_notification' || (line.subtype === 'task_updated' && AGENT_END.has(patch?.status as string))) {
      pane.agents.delete(id)
      return
    }
    if (line.subtype === 'task_started' && line.task_type !== 'local_agent') return
    if (line.subtype === 'task_started' || pane.agents.has(id)) pane.agents.set(id, this.now())
  }

  async sweep(): Promise<void> {
    for (const [paneId, pane] of [...this.panes]) {
      if (pane.agents.size === 0 || !pane.sessionId) continue
      try {
        await this.sweepPane(paneId, pane, pane.sessionId)
      } catch (err) {
        console.error('[agents] sweep of a chat failed', err)
      }
    }
  }

  private async sweepPane(paneId: string, pane: PaneAgents, sessionId: string): Promise<void> {
    const dir = join(await this.transcriptsDirFor(pane.cwd), sessionId, 'subagents')
    const children = await this.childrenOf(dir)
    for (const [taskId, lastEventAt] of [...pane.agents]) {
      if (!(await this.over(dir, taskId, lastEventAt, descendants(children, taskId)))) continue
      if (this.panes.get(paneId) !== pane || !pane.agents.delete(taskId)) continue
      for (const cb of this.listeners) cb(paneId, taskId)
    }
  }

  /** Each agent's own agents, by the parent named in their meta files. */
  private async childrenOf(dir: string): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>()
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      return out
    }
    for (const name of names) {
      const id = /^agent-(.+)\.meta\.json$/.exec(name)?.[1]
      if (!id) continue
      const parent = (await readJson(join(dir, name)))?.parentAgentId
      if (typeof parent !== 'string') continue
      out.set(parent, [...(out.get(parent) ?? []), id])
    }
    return out
  }

  private async over(dir: string, taskId: string, lastEventAt: number, children: readonly string[]): Promise<boolean> {
    const file = join(dir, `agent-${taskId}.jsonl`)
    let activity = latestOf(lastEventAt, await mtime(file))
    for (const child of children) activity = latestOf(activity, await mtime(join(dir, `agent-${child}.jsonl`)))
    let items: ChatItem[]
    try {
      items = (await readLastItems(file, TAIL_ITEMS, TAIL_MAX_BYTES, true)).items
    } catch {
      items = []
    }
    const meta = await readJson(join(dir, `agent-${taskId}.meta.json`))
    return agentOver(items, { finished: meta?.finished === true }, activity, this.now())
  }
}
