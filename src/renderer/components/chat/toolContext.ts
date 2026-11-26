import { createContext, useContext } from 'react'
import type { ToolPairs } from './toolCall'
import type { ChatItem } from './types'
import type { SubagentTasks } from './subagents'
import type { BackgroundOutcome, ForegroundCalls } from './runInBackground'
import type { FeatureProposal, ProposalState, WorkspaceOption } from '../../../shared/featureProposal'

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
  /** Where the session's transcripts are, for each subagent's own file. */
  transcript?: TranscriptSource
  /** The chat whose Agents tab an Agent call opens. */
  chatKey?: string
}

/** What "Run in background" needs: the calls the CLI could still move, and the means to ask it. */
export interface BackgroundHost {
  foreground: ForegroundCalls
  /** The session refused a move before, so the line no longer shows. */
  refused: boolean
  move: (toolUseIds: readonly string[]) => Promise<BackgroundOutcome>
}

/** The main chat only: how each feature proposal in its transcript stands, and the workspaces a proposal may name. */
export interface ProposalHost {
  states: ReadonlyMap<string, ProposalState>
  options: readonly WorkspaceOption[]
  /** Go: starts the proposed feature in the workspace; resolves with why it failed, null on success, or undefined when one is already starting. */
  go: (proposal: FeatureProposal, workspaceId: string) => Promise<string | null | undefined>
  /** Shows the session of the feature with this name; resolves with why it cannot, or null. */
  open: (name: string) => Promise<string | null>
}

interface ToolContextValue {
  pairs: ToolPairs
  cwd: string | undefined
  /** The TodoWrite call holding the current list; it opens, earlier lists stay folded. */
  latestTodoId?: string
  /** Each Agent or SendMessage call's subagent items. */
  subagentItems: ReadonlyMap<string, ChatItem[]>
  agents?: AgentHost
  /** Tool calls still waiting on their result while the turn runs. */
  running: ReadonlySet<string>
  background?: BackgroundHost
  proposals?: ProposalHost
}

const NO_PAIRS: ToolPairs = { resultFor: new Map(), isPaired: () => false }

export const ToolContext = createContext<ToolContextValue>({ pairs: NO_PAIRS, cwd: undefined, subagentItems: new Map(), running: new Set() })

export function useToolContext(): ToolContextValue {
  return useContext(ToolContext)
}
