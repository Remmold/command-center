import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ChatItem } from '../../shared/chatItems'
import { sidechainLineToItems } from '../observed/transcriptItems'

/** The extension's check before it reads one (`getSubagentTranscript`). */
const PLAIN_ID = /^[A-Za-z0-9_-]{1,128}$/

export interface SubagentRef {
  /** The agent's id, which is its task id. */
  agentId?: string
  /** The Agent call that started it, matched against the `toolUseId` of each agent's `.meta.json`. */
  toolUseId?: string
}

async function agentIdForCall(subagents: string, toolUseId: string): Promise<string | null> {
  let names: string[]
  try {
    names = await fs.readdir(subagents)
  } catch {
    return null
  }
  for (const name of names) {
    const m = /^agent-([A-Za-z0-9_-]+)\.meta\.json$/.exec(name)
    if (!m) continue
    try {
      const meta = JSON.parse(await fs.readFile(join(subagents, name), 'utf-8')) as { toolUseId?: unknown }
      if (meta.toolUseId === toolUseId) return m[1]
    } catch {
      continue
    }
  }
  return null
}

/** A subagent's own transcript, `<transcripts>/<session>/subagents/agent-<id>.jsonl`, as chat items; null when there is none. */
export async function readSubagentTranscript(transcripts: string, sessionId: string, ref: SubagentRef): Promise<ChatItem[] | null> {
  if (!PLAIN_ID.test(sessionId)) return null
  const subagents = join(transcripts, sessionId, 'subagents')
  let agentId = ref.agentId && PLAIN_ID.test(ref.agentId) ? ref.agentId : null
  if (ref.agentId && !agentId) return null
  if (!agentId && ref.toolUseId) agentId = await agentIdForCall(subagents, ref.toolUseId)
  if (!agentId) return null
  let text: string
  try {
    text = await fs.readFile(join(subagents, `agent-${agentId}.jsonl`), 'utf-8')
  } catch {
    return null
  }
  return text.split('\n').flatMap((line) => sidechainLineToItems(line))
}
