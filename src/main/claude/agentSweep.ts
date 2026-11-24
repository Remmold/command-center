import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { agentOver } from '../../shared/agentSummary'
import { agentFiles, type AgentFileCache } from './agentFiles'

/** How often agents still reported working are checked against their files. */
export const SWEEP_MS = 60_000
const AGENT_END = new Set(['completed', 'failed', 'killed', 'stopped'])

interface PaneAgents {
  cwd: string
  sessionId?: string
  /** Agents the CLI reported started and not yet ended. */
  agents: Set<string>
}

type Ended = (paneId: string, taskId: string) => void

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, 'utf-8'))
    return isRecord(raw) ? raw : undefined
  } catch {
    return undefined
  }
}

/**
 * Follows the agents each chat's CLI reports as started and checks their own files: one that handed back or was
 * interrupted counts as ended even when the CLI never says so, so it cannot keep the chat Running or the update gate
 * busy for good. Silence never ends one while its process lives, as a long build writes nothing until it returns.
 */
export class AgentSweep {
  private panes = new Map<string, PaneAgents>()
  private listeners: Ended[] = []
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly transcriptsDirFor: (cwd: string) => Promise<string>,
    private readonly files: AgentFileCache = agentFiles
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
    this.panes.set(paneId, { cwd, agents: new Set() })
  }

  exited(paneId: string): void {
    this.panes.delete(paneId)
  }

  event(paneId: string, line: unknown): void {
    const pane = this.panes.get(paneId)
    if (!pane || !isRecord(line)) return
    if (typeof line.session_id === 'string' && line.session_id !== '') pane.sessionId = line.session_id
    if (line.type !== 'system' || typeof line.task_id !== 'string') return
    const patch = isRecord(line.patch) ? line.patch : undefined
    if (line.subtype === 'task_notification' || (line.subtype === 'task_updated' && AGENT_END.has(patch?.status as string))) pane.agents.delete(line.task_id)
    else if (line.subtype === 'task_started' && line.task_type === 'local_agent') pane.agents.add(line.task_id)
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
    for (const taskId of [...pane.agents]) {
      if (!(await this.over(dir, taskId))) continue
      if (this.panes.get(paneId) !== pane || !pane.agents.delete(taskId)) continue
      for (const cb of this.listeners) cb(paneId, taskId)
    }
  }

  private async over(dir: string, taskId: string): Promise<boolean> {
    let summary
    try {
      // The summary the Agents tab already keeps; only bytes written since it was read are parsed.
      summary = (await this.files.read(join(dir, `agent-${taskId}.jsonl`))).summary
    } catch {
      return false
    }
    const meta = await readJson(join(dir, `agent-${taskId}.meta.json`))
    return agentOver(summary, { finished: meta?.finished === true })
  }
}
