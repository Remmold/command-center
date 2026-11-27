import { createContext, useContext } from 'react'
import type { ToolPairs } from './toolCall'
import type { ChatItem } from './types'
import type { SubagentTasks } from './subagents'
import type { BackgroundOutcome, ForegroundCalls } from './runInBackground'
import type { ActionState } from '../../../shared/actionBlocks'
import type { FeatureProposal, WorkspaceOption } from '../../../shared/featureProposal'
import type { FeatureRecord } from '../../../shared/features'
import type { AdoptBlock, AdoptPreflight } from '../../../shared/adoptWork'
import type { HousekeepingCheck, HousekeepingRequest, HousekeepingRun } from '../../../shared/housekeeping'
import type { SendMessageBlock } from '../../../shared/sendMessage'

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

/** What a card's button resolves with: why the action failed, null when it ran, or undefined when it did not run (one already under way). */
export type ActionRun = Promise<string | null | undefined>

/** The main chat only: how each card in its transcript stands, and each kind's preflight and action. */
export interface ActionHost {
  states: ReadonlyMap<string, ActionState>
  options: readonly WorkspaceOption[]
  features: readonly FeatureRecord[]
  /** The names of the existing features; a change means every live card's preflight is asked again. */
  featureNames: readonly string[]
  proposal: {
    /** Preflight: why Go would fail for the proposal in the workspace, or null when nothing stands in its way. */
    check: (proposal: FeatureProposal, workspaceId: string) => Promise<string | null>
    go: (key: string, proposal: FeatureProposal, workspaceId: string) => ActionRun
    /** Shows the session of the feature with this name; resolves with why it cannot, or null. */
    open: (name: string) => Promise<string | null>
  }
  openSession: {
    /** Preflight: why no session can be opened for the name, or null when exactly one feature has it. */
    check: (name: string) => string | null
    open: (name: string) => ActionRun
  }
  adopt: {
    /** Preflight: a fresh scan resolving the block to one open-work item, with what adopting it would do. */
    check: (block: AdoptBlock, workspaceId: string) => Promise<AdoptPreflight>
    go: (key: string, block: AdoptBlock, workspaceId: string) => ActionRun
  }
  sendMessage: {
    /** Preflight: why the message cannot reach the feature's session, or null. */
    check: (name: string) => string | null
    /** Sends now, or queues until the session's turn ends; only a live card's click sends. */
    send: (key: string, block: SendMessageBlock) => ActionRun
  }
  housekeeping: {
    /** Preflight: every item checked now, as Will and Will skip. */
    check: (request: HousekeepingRequest) => Promise<HousekeepingCheck>
    /** Undefined when the card was not live, so nothing ran. */
    run: (key: string, request: HousekeepingRequest) => Promise<HousekeepingRun | undefined>
  }
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
  actions?: ActionHost
}

const NO_PAIRS: ToolPairs = { resultFor: new Map(), isPaired: () => false }

export const ToolContext = createContext<ToolContextValue>({ pairs: NO_PAIRS, cwd: undefined, subagentItems: new Map(), running: new Set() })

export function useToolContext(): ToolContextValue {
  return useContext(ToolContext)
}
