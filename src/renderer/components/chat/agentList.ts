import type { AgentTail, AgentTails } from '../../../shared/subagentTail'
import { mcpToolTitle } from './mcpTool'
import { stampLabel } from './messageTime'
import { agentFileEnd, isQuiet, isRelayNotice, latestOf, type AgentFileEnd } from '../../../shared/agentEnd'
import { AGENT_STATUS_LABEL, AGENT_TOOLS, agentStatus, duration, isBackgroundReceipt, type AgentStatus, type SubagentTask, type SubagentTasks } from './subagents'
import { pairToolResults, toolCallTitle } from './toolCall'
import type { ChatItem, ToolResultItem } from './types'

export type { AgentTail, AgentTails }

export interface AgentEntry {
  /** The agent id when known, else its call's id. */
  key: string
  agentId?: string
  toolUseId?: string
  /** The session prompt whose turn started it. */
  promptId?: string
  name: string
  prompt?: string
  subagentType?: string
  background?: boolean
  status: AgentStatus
  startTime?: number
  elapsedMs?: number
  /** When it, or an agent of its own, last wrote or was reported on. */
  lastActivityAt?: number
  toolUses: number
  /** What it does right now: its latest tool call, "thinking…", or its last line of text. */
  now?: string
  /** The first lines of what it reported once done, as one line. */
  summary?: string
  /** Its whole handed-back report; a report in plain text is already its last message. */
  report?: string
  task?: SubagentTask
  /** Its own messages, from its file or else from the parent's stream. */
  items: readonly ChatItem[]
  children: AgentEntry[]
}

export interface FlatAgent extends AgentEntry {
  depth: number
}

interface CallInput {
  description?: string
  prompt?: string
  subagent_type?: string
  run_in_background?: boolean
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

function inputOf(input: unknown): CallInput {
  if (!input || typeof input !== 'object') return {}
  const o = input as Record<string, unknown>
  return {
    description: str(o.description),
    prompt: str(o.prompt),
    subagent_type: str(o.subagent_type),
    run_in_background: o.run_in_background === true ? true : undefined
  }
}

const firstLine = (text: string | undefined): string | undefined =>
  text
    ?.split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '')

const lastLine = (text: string): string | undefined =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .at(-1)

/** The description; without one the agent type and the prompt's first line; "Agent" when there is neither. */
export function agentName(description: string | undefined, subagentType: string | undefined, prompt: string | undefined): string {
  if (description) return description
  const line = firstLine(prompt)
  if (subagentType && line) return `${subagentType}: ${line}`
  return line ?? subagentType ?? 'Agent'
}

/** A tool call in the timeline's own words: "Read api/auth.ts", "Bash pnpm test". */
function toolLabel(name: string, input: unknown, cwd: string | undefined): string {
  const mcp = mcpToolTitle(name, input)
  if (mcp) return [`${mcp.server} [${mcp.tool}]`, mcp.detail].filter(Boolean).join(' ')
  const { target } = toolCallTitle(name, input, cwd)
  return target ? `${name} ${target}` : name
}

/** The agent's latest step: its newest tool call, thinking or text; undefined before it sends anything. */
export function nowLine(items: readonly ChatItem[], cwd: string | undefined): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'assistant') continue
    for (let b = item.content.length - 1; b >= 0; b--) {
      const block = item.content[b] as { type: string; name?: unknown; input?: unknown; text?: unknown }
      if (block.type === 'tool_use' && typeof block.name === 'string') return toolLabel(block.name, block.input, cwd)
      if (block.type === 'thinking') return 'thinking…'
      if (block.type === 'text' && typeof block.text === 'string') {
        const line = lastLine(block.text)
        if (line) return line
      }
    }
  }
  return undefined
}

function toolUseCount(items: readonly ChatItem[]): number {
  let n = 0
  for (const item of items) if (item.kind === 'assistant') for (const b of item.content) if (b.type === 'tool_use') n++
  return n
}

function agentCallIds(items: readonly ChatItem[]): string[] {
  const ids: string[] = []
  for (const item of items) {
    if (item.kind !== 'assistant') continue
    for (const b of item.content) if (b.type === 'tool_use' && typeof b.id === 'string' && AGENT_TOOLS.has(b.name as string)) ids.push(b.id)
  }
  return ids
}

function resultText(result: ToolResultItem): string | undefined {
  const c = result.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return (c as { type?: unknown; text?: unknown }[]).flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('\n')
  return undefined
}

function firstAt(items: readonly ChatItem[]): number | undefined {
  return items.find((i) => i.at !== undefined)?.at
}

function lastAt(items: readonly ChatItem[]): number | undefined {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].at !== undefined) return items[i].at
  return undefined
}

export interface AgentInputs {
  toolUseId?: string
  input?: unknown
  result?: ToolResultItem
  task?: SubagentTask
  tail?: AgentTail
  /** The agent's messages as the parent's stream carried them, used until its file has any. */
  streamItems?: readonly ChatItem[]
  /** When its call was made, for an agent nothing else is known of. */
  callAt?: number
  running: boolean
  cwd: string | undefined
  now: number
}

const NO_ITEMS: ChatItem[] = []

const replies = (items: readonly ChatItem[]): number => items.reduce((n, i) => n + (i.kind === 'assistant' ? 1 : 0), 0)

/** The agent's file, unless the parent's stream has carried more of its replies than the file has shown so far. */
function freshest(file: readonly ChatItem[] | undefined, stream: readonly ChatItem[] | undefined): readonly ChatItem[] {
  if (stream && stream.length > 0 && (!file || replies(stream) > replies(file))) return stream
  return file && file.length > 0 ? file : NO_ITEMS
}

/** One agent's row: name, status, times, tool count and now line, from whatever is known of it. */
export function agentEntry({ toolUseId, input, result, task, tail, streamItems, callAt, running, cwd, now }: AgentInputs): AgentEntry {
  const call = inputOf(input)
  const meta = tail?.meta
  const items = freshest(tail?.items, streamItems)
  const callId = toolUseId ?? task?.toolUseId ?? meta?.toolUseId
  const startTime = task?.startTime ?? meta?.startedAt ?? firstAt(items) ?? callAt
  const lastActivityAt = latestOf(lastAt(items), task?.lastEventAt ?? task?.startTime) ?? callAt
  const quiet = isQuiet(lastActivityAt, now)
  const launchedOnly = !result || (!result.isError && isBackgroundReceipt(result))
  const confirmed = !launchedOnly || (task !== undefined && task.status !== 'working')
  const end = agentFileEnd(items, { finished: meta?.finished, confirmed, quiet })
  const status = statusOf({ task, end, callKnown: input !== undefined, callId, result, launchedOnly, items, quiet, running })
  const endTime = status === 'working' ? undefined : status === 'ended' ? lastActivityAt : (end?.at ?? task?.endTime ?? lastAt(items))
  const elapsedMs = startTime === undefined ? undefined : status === 'working' ? Math.max(0, now - startTime) : endTime !== undefined ? Math.max(0, endTime - startTime) : undefined
  const told = result && !launchedOnly && !result.isError ? resultText(result) : undefined
  const summary = reportPreview(told && !isRelayNotice(told) ? told : undefined) ?? reportPreview(end?.report) ?? reportPreview(task?.summary)
  const description = task?.description && task.description !== 'Agent' ? task.description : (call.description ?? meta?.description)
  const subagentType = task?.subagentType ?? call.subagent_type ?? meta?.agentType
  const prompt = task?.prompt ?? call.prompt
  const agentId = task?.taskId ?? meta?.agentId
  return {
    key: agentId ?? callId ?? 'agent',
    ...(agentId ? { agentId } : {}),
    ...(callId ? { toolUseId: callId } : {}),
    ...(meta?.promptId ? { promptId: meta.promptId } : {}),
    name: agentName(description, subagentType, prompt),
    ...(prompt ? { prompt } : {}),
    ...(subagentType ? { subagentType } : {}),
    ...((task?.isBackgrounded ?? call.run_in_background) ? { background: true } : {}),
    status,
    ...(startTime !== undefined ? { startTime } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(lastActivityAt !== undefined ? { lastActivityAt } : {}),
    toolUses: Math.max(task?.usage?.toolUses ?? 0, toolUseCount(items)),
    now: nowLine(items, cwd),
    ...(summary ? { summary } : {}),
    ...(end?.handedBack && end.report ? { report: end.report } : {}),
    ...(task ? { task } : {}),
    items,
    children: []
  }
}

const PREVIEW_LINES = 3
const PREVIEW_CHARS = 300

/** A report's first lines as one plain line: list marks, headings and emphasis dropped. */
export function reportPreview(report: string | undefined): string | undefined {
  if (!report) return undefined
  const lines = report
    .split('\n')
    .map((l) =>
      l
        .trim()
        .replace(/^(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, '')
        .replace(/\*\*|__|`/g, '')
        .trim()
    )
    .filter((l) => l !== '')
    .slice(0, PREVIEW_LINES)
  if (lines.length === 0) return undefined
  const text = lines.join(' ')
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 1)}…` : text
}

interface StatusInputs {
  task: SubagentTask | undefined
  end: AgentFileEnd | undefined
  callKnown: boolean
  callId: string | undefined
  result: ToolResultItem | undefined
  launchedOnly: boolean
  items: readonly ChatItem[]
  quiet: boolean
  running: boolean
}

/**
 * The agent's own file decides first: a handback or an interrupt ends it whatever else says so. Then the CLI's task
 * events, then a final reply in its file, then the call's result; a background call's result is only its launch receipt. An agent still
 * open by all of these works until nothing it does has written for 10 minutes, then it ended without a report.
 */
function statusOf({ task, end, callKnown, callId, result, launchedOnly, items, quiet, running }: StatusInputs): AgentStatus {
  if (end && (end.handedBack || end.status === 'stopped')) return end.status
  if (task && task.status !== 'working') return task.status
  if (end) return end.status
  if (!task && callKnown && callId !== undefined && !launchedOnly) return agentStatus(callId, {}, result, running).status
  if (quiet) return 'ended'
  if (task || items.length > 0) return 'working'
  return running ? 'working' : 'stopped'
}

const STATUS_RANK: Record<AgentStatus, number> = { working: 0, failed: 1, stopped: 1, finished: 1, ended: 1 }

/** Working agents first, then by start time, oldest first; an agent with no known start goes last. */
export function orderAgents(agents: readonly AgentEntry[]): AgentEntry[] {
  return [...agents].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.startTime ?? Infinity) - (b.startTime ?? Infinity))
}

export interface ChatAgentsInput {
  /** The chat's items, subagent messages from the stream included. */
  items: readonly ChatItem[]
  tasks: SubagentTasks
  tails: AgentTails
  running: boolean
  cwd: string | undefined
  now: number
}

/** Every agent of the session, from the CLI's task events, the Agent calls and the agents' own files; nested under the agent that started it. */
export function collectAgents({ items, tasks, tails, running, cwd, now }: ChatAgentsInput): AgentEntry[] {
  const allItems = [...items, ...Object.values(tails).flatMap((t) => t.items)]
  const results = pairToolResults(allItems).resultFor
  const inputs = new Map<string, unknown>()
  const callAt = new Map<string, number>()
  for (const item of allItems) {
    if (item.kind !== 'assistant') continue
    for (const b of item.content) {
      if (b.type !== 'tool_use' || typeof b.id !== 'string' || !AGENT_TOOLS.has(b.name as string)) continue
      inputs.set(b.id, b.input)
      if (item.at !== undefined) callAt.set(b.id, item.at)
    }
  }
  const streamFor = new Map<string, ChatItem[]>()
  for (const item of items) {
    const parent = item.kind === 'assistant' || item.kind === 'tool_result' ? item.parentToolUseId : undefined
    if (!parent) continue
    const list = streamFor.get(parent)
    if (list) list.push(item)
    else streamFor.set(parent, [item])
  }

  const callIds = [...inputs.keys()]
  const taskList = Object.values(tasks)
  const tailList = Object.values(tails)
  const seenCalls = new Set<string>()
  const seenAgents = new Set<string>()
  const entries: AgentEntry[] = []
  const add = (toolUseId: string | undefined, task: SubagentTask | undefined, tail: AgentTail | undefined): void => {
    if (toolUseId) seenCalls.add(toolUseId)
    const agentId = task?.taskId ?? tail?.meta.agentId
    if (agentId) seenAgents.add(agentId)
    entries.push(
      agentEntry({
        toolUseId,
        input: toolUseId ? inputs.get(toolUseId) : undefined,
        result: toolUseId ? results.get(toolUseId) : undefined,
        task,
        tail,
        streamItems: toolUseId ? streamFor.get(toolUseId) : undefined,
        callAt: toolUseId ? callAt.get(toolUseId) : undefined,
        running,
        cwd,
        now
      })
    )
  }
  for (const task of taskList) {
    const tail = tails[task.taskId] ?? (task.toolUseId ? tailList.find((t) => t.meta.toolUseId === task.toolUseId) : undefined)
    add(task.toolUseId ?? tail?.meta.toolUseId, task, tail)
  }
  for (const tail of tailList) {
    if (seenAgents.has(tail.meta.agentId) || (tail.meta.toolUseId && seenCalls.has(tail.meta.toolUseId))) continue
    add(tail.meta.toolUseId, undefined, tail)
  }
  for (const id of callIds) if (!seenCalls.has(id)) add(id, undefined, undefined)

  const parentOf = new Map<string, AgentEntry>()
  for (const entry of entries) for (const id of agentCallIds(entry.items)) parentOf.set(id, entry)
  const top: AgentEntry[] = []
  for (const entry of entries) {
    const parent = entry.toolUseId ? parentOf.get(entry.toolUseId) : undefined
    if (parent && parent !== entry) parent.children.push(entry)
    else top.push(entry)
  }
  const settle = (list: AgentEntry[]): AgentEntry[] => orderAgents(list.map((e) => withChildren(e, settle(e.children), now)))
  return settle(top)
}

/** An agent waiting on its own agents is as active as they are: it works while one of them does. */
function withChildren(entry: AgentEntry, children: AgentEntry[], now: number): AgentEntry {
  const lastActivityAt = children.reduce<number | undefined>((at, c) => latestOf(at, c.lastActivityAt), entry.lastActivityAt)
  const childWorks = children.some((c) => c.status === 'working')
  const wakes = entry.status === 'ended' && childWorks
  return {
    ...entry,
    children,
    ...(lastActivityAt !== undefined ? { lastActivityAt } : {}),
    ...(wakes ? { status: 'working' as const, ...(entry.startTime !== undefined ? { elapsedMs: Math.max(0, now - entry.startTime) } : {}) } : {})
  }
}

export interface AgentGroup {
  key: string
  /** When its first agent started. */
  startTime?: number
  /** Its agents in list order, each with its own agents under it. */
  agents: AgentEntry[]
  /** Every agent in it, nested ones included. */
  count: number
  working: number
}

/** For each Agent call in the chat, the prompt whose turn made it. */
function turnOfCalls(items: readonly ChatItem[]): Map<string, string> {
  const turns = new Map<string, string>()
  let turn: string | undefined
  for (const item of items) {
    if (item.kind === 'user') turn = item.id
    else if (item.kind === 'assistant' && turn !== undefined)
      for (const b of item.content) if (b.type === 'tool_use' && typeof b.id === 'string' && AGENT_TOOLS.has(b.name as string)) turns.set(b.id, turn)
  }
  return turns
}

/**
 * The agents by the turn that started them, newest turn first. A turn is the prompt id in the agent's file, else the
 * prompt before its call in the chat; an agent with both ties the two together, so file-only and call-only agents of
 * one turn share it.
 */
export function groupAgents(agents: readonly AgentEntry[], items: readonly ChatItem[]): AgentGroup[] {
  const callTurns = turnOfCalls(items)
  const turnOf = (a: AgentEntry): string | undefined => (a.toolUseId ? callTurns.get(a.toolUseId) : undefined)
  const promptForTurn = new Map<string, string>()
  for (const a of agents) {
    const turn = turnOf(a)
    if (turn && a.promptId && !promptForTurn.has(turn)) promptForTurn.set(turn, a.promptId)
  }
  const byKey = new Map<string, AgentEntry[]>()
  for (const a of agents) {
    const turn = turnOf(a)
    const key = a.promptId ?? (turn ? (promptForTurn.get(turn) ?? turn) : `agent:${a.key}`)
    const list = byKey.get(key)
    if (list) list.push(a)
    else byKey.set(key, [a])
  }
  const groups = [...byKey].map(([key, list]): AgentGroup => {
    const flat = flatAgents(list)
    const starts = list.flatMap((a) => (a.startTime !== undefined ? [a.startTime] : []))
    return {
      key,
      ...(starts.length > 0 ? { startTime: Math.min(...starts) } : {}),
      agents: orderAgents(list),
      count: flat.length,
      working: flat.filter((a) => a.status === 'working').length
    }
  })
  return groups.sort((a, b) => (b.startTime ?? -Infinity) - (a.startTime ?? -Infinity))
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/** When a turn's agents started: the time, with the day when that was not today. */
export function startLabel(at: number, now: number): string {
  const time = stampLabel(at)
  return new Date(at).toDateString() === new Date(now).toDateString() ? time : `${DAY_FORMAT.format(new Date(at))}, ${time}`
}

/** The Agents tab's count: how many work, or none when none do. */
export function agentTabCount(agents: readonly AgentEntry[]): string | undefined {
  const working = flatAgents(agents).filter((a) => a.status === 'working').length
  return working > 0 ? `${working} working` : undefined
}

/** The tree in reading order, each with its depth, for the list and its keys. */
export function flatAgents(agents: readonly AgentEntry[], depth = 0): FlatAgent[] {
  return agents.flatMap((a) => [{ ...a, depth }, ...flatAgents(a.children, depth + 1)])
}

/** How often a list with working agents re-reads the clock, so one that went quiet turns ended without any event. */
export const AGENT_RECHECK_MS = 30_000

/** Agents the CLI started in this process still working once its turn has ended, by the Agents tab's rules; none while the turn runs, as the working line shows then. */
export function agentsStillWorking(tasks: SubagentTasks, tails: AgentTails, turnActive: boolean, now: number): number {
  if (turnActive || !Object.values(tasks).some((t) => t.status === 'working')) return 0
  return flatAgents(collectAgents({ items: [], tasks, tails, running: true, cwd: undefined, now })).filter((a) => a.task !== undefined && a.status === 'working').length
}

/** The agent as shown at `now`: a working agent's time keeps counting, until it has been quiet too long and ended. */
export function atTime(agent: FlatAgent, now: number): FlatAgent {
  if (agent.status !== 'working') return agent
  const last = agent.lastActivityAt
  if (last !== undefined && isQuiet(last, now)) {
    return { ...agent, status: 'ended', ...(agent.startTime !== undefined ? { elapsedMs: Math.max(0, last - agent.startTime) } : {}) }
  }
  return agent.startTime !== undefined ? { ...agent, elapsedMs: Math.max(0, now - agent.startTime) } : agent
}

/** Status, time so far or run length, and tool count: "Working · 1m 4s · 3 tools". */
export function agentRowMeta(agent: Pick<AgentEntry, 'status' | 'elapsedMs' | 'toolUses'>): string {
  const parts: string[] = [AGENT_STATUS_LABEL[agent.status]]
  if (agent.elapsedMs !== undefined && (agent.status === 'working' || agent.elapsedMs >= 1000)) parts.push(duration(agent.elapsedMs))
  if (agent.toolUses > 0) parts.push(`${agent.toolUses} ${agent.toolUses === 1 ? 'tool' : 'tools'}`)
  return parts.join(' · ')
}

/** The agent's line under its name: what it does now while working, else what it reported. */
export function agentDetail(agent: Pick<AgentEntry, 'status' | 'now' | 'summary'>): string | undefined {
  if (agent.status === 'working') return agent.now ? `now: ${agent.now}` : undefined
  return agent.summary
}
