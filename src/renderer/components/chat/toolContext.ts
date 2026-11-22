import { createContext, useContext } from 'react'
import type { ToolPairs } from './toolCall'
import type { ChatItem } from './types'
import type { SubagentTasks } from './subagents'

/** A hosted or followed session whose transcripts folder holds its subagents' own files. */
export interface TranscriptSource {
  cwd: string
  sessionId: string
}

/** What an Agent call needs beyond its items: the pane's live tasks and the means to stop one or read its transcript. */
export interface AgentHost {
  tasks: SubagentTasks
  /** True while the chat's CLI process runs; a call with no result is then still working. */
  running: boolean
  /** Sends `stop_task`; resolves to an error message when the CLI refused. */
  stop?: (taskId: string) => Promise<string | null>
  /** Where the session's transcripts are, for a subagent's own transcript file. */
  transcript?: TranscriptSource
}

interface ToolContextValue {
  pairs: ToolPairs
  cwd: string | undefined
  /** The TodoWrite call holding the current list; it opens, earlier lists stay folded. */
  latestTodoId?: string
  /** Each Agent or SendMessage call's subagent items. */
  subagentItems: ReadonlyMap<string, ChatItem[]>
  agents?: AgentHost
}

const NO_PAIRS: ToolPairs = { resultFor: new Map(), isPaired: () => false }

export const ToolContext = createContext<ToolContextValue>({ pairs: NO_PAIRS, cwd: undefined, subagentItems: new Map() })

export function useToolContext(): ToolContextValue {
  return useContext(ToolContext)
}
