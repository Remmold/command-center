import type { ChatItem } from './chatItems'

/** What a subagent's `agent-<id>.meta.json` says about it; only the id is certain. */
export interface SubagentMeta {
  agentId: string
  agentType?: string
  description?: string
  /** The Agent call that started it. */
  toolUseId?: string
}

/** What the session's `subagents/` folder holds for one agent. */
export interface AgentTail {
  meta: SubagentMeta
  items: ChatItem[]
}

/** A session's followed agent files, by agent id. */
export type AgentTails = Readonly<Record<string, AgentTail>>

/** A session whose `subagents/` folder is followed, named by its cwd and session id. */
export interface SubagentSource {
  cwd: string
  sessionId: string
}

export function subagentSourceKey(source: SubagentSource): string {
  return `${source.cwd}\n${source.sessionId}`
}

/** New items from one agent's file; `reset` replaces what was read before (the first read, or a file that shrank). */
export interface SubagentTailEvent {
  key: string
  agentId: string
  meta: SubagentMeta
  items: ChatItem[]
  reset?: boolean
}
