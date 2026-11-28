import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTicking } from '../../hooks/useTicking'
import { MEDIA_TAB_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useChatItemsStore } from '../../state/chatItemsStore'
import { mediaKeyOf, shownTab, useChatMediaStore, type ChatMediaKey, type ChatTab } from '../../state/chatMediaStore'
import { useObservedStore } from '../../state/observedStore'
import { useAgentTails } from '../../state/subagentTailsStore'
import { useTestFlowsFolder } from '../../state/testFlowStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { findTestFlows, repoNameFor, type TestFlowPick, type TestFlowView } from '../../../shared/testFlow'
import { TestFlowPanel } from '../testFlow/TestFlowPanel'
import { useTestFlowView, viewKeyOf } from '../testFlow/useTestFlowView'
import { TabStrip } from '../ui/TabStrip'
import { collectMedia, type MediaAttachment, type MediaEntry } from './chatMedia'
import { MediaGrid } from './MediaGrid'
import { AgentsPanel } from './AgentsPanel'
import { ProcessesPanel } from './ProcessesPanel'
import { usePaneProcesses } from '../../state/backgroundProcessesStore'
import { runningCount } from '../../../shared/backgroundProcesses'
import { AGENT_RECHECK_MS, agentTabCount, collectAgents, flatAgents, type AgentEntry } from './agentList'
import { AGENT_TOOLS } from './subagents'
import type { AgentHost } from './toolContext'
import type { ChatItem } from './types'

const NO_ITEMS: ChatItem[] = []
const NO_ATTACHMENTS: MediaAttachment[] = []
const NO_AGENTS: AgentEntry[] = []

interface SessionMedia {
  media: MediaEntry[]
  /** The item count, which grows as the turn streams. */
  revision: number
  items: ChatItem[]
}

function useHostedMedia(paneId: string, cwd: string): SessionMedia {
  const items = useChatItemsStore((s) => s.items[paneId] ?? NO_ITEMS)
  const attachments = useChatMediaStore((s) => s.attachments[paneId] ?? NO_ATTACHMENTS)
  const media = useMemo(() => collectMedia({ items, cwd, attachments }), [items, cwd, attachments])
  return { media, revision: items.length, items }
}

function useObservedMedia(cwd: string | undefined): SessionMedia {
  const items = useObservedStore((s) => s.items)
  const media = useMemo(() => collectMedia({ items, cwd }), [items, cwd])
  return { media, revision: items.length, items }
}

function hasAgentCall(items: readonly ChatItem[]): boolean {
  return items.some((item) => item.kind === 'assistant' && item.content.some((b) => b.type === 'tool_use' && AGENT_TOOLS.has(b.name as string)))
}

/** The session's agents, following their files once it has any; the transcript does not read these, so following never redraws it. */
function useChatAgents(items: readonly ChatItem[], host: AgentHost | undefined, cwd: string | undefined): AgentEntry[] {
  const tasks = host?.tasks
  const known = useMemo(() => (tasks !== undefined && Object.keys(tasks).length > 0) || hasAgentCall(items), [tasks, items])
  const tails = useAgentTails(host?.transcript, known)
  const running = host?.running ?? false
  const [anyWorking, setAnyWorking] = useState(false)
  // An agent that stops writing turns ended with no event to say so; a slow clock catches it.
  const tick = useTicking(anyWorking, AGENT_RECHECK_MS)
  const clock = anyWorking ? tick : 0
  const agents = useMemo(
    () => (known || Object.keys(tails).length > 0 ? collectAgents({ items, tasks: tasks ?? {}, tails, running, cwd, now: Date.now() }) : NO_AGENTS),
    [known, items, tasks, tails, running, cwd, clock]
  )
  const working = useMemo(() => agentTabCount(agents) !== undefined, [agents])
  useEffect(() => setAnyWorking(working), [working])
  return agents
}

interface SessionTestFlow {
  picks: TestFlowPick[]
  view: TestFlowView | null
  folder: string
  repoName: string
}

function useSessionTestFlow(items: readonly ChatItem[], cwd: string | undefined): SessionTestFlow {
  const folder = useTestFlowsFolder() ?? ''
  const repoName = useWorkspacesStore((s) => repoNameFor(s.workspaces, cwd))
  const picks = useMemo(() => findTestFlows({ items, folder, repoName }), [items, folder, repoName])
  const paths = useMemo(() => picks.map((p) => p.path), [picks])
  const view = useTestFlowView(paths)
  return { picks, view, folder, repoName }
}

/** True once what the Test tab shows changed while another tab was open, until the Test tab opens again. */
function useTestFlowDot(view: TestFlowView | null, testOpen: boolean): boolean {
  const key = viewKeyOf(view)
  const [seen, setSeen] = useState<string | null>(null)
  if (key !== null && key !== seen && (seen === null || testOpen)) setSeen(key)
  return !testOpen && seen !== null && key !== null && key !== seen
}

interface TabsProps extends SessionMedia {
  chatKey: ChatMediaKey
  cwd: string | undefined
  agentHost: AgentHost
  /** A hosted chat's pane, which gets the Processes tab; none for a followed VS Code session. */
  processesPane?: string
  /** Running background processes, shown on the Processes tab. */
  processesRunning?: number
  /** Shows the transcript alone, without the tab strip. */
  transcriptOnly?: boolean
  children: ReactNode
}

const AGENTS_TITLE = "This session's subagents and what they are doing"
const PROCESSES_TITLE = 'Commands the agents left running in the background'

function popOut(): void {
  window.api.testFlow.popOut().catch((err) => console.error('could not open the test-flow window', err))
}

/**
 * The Chat, Agents, Media, Processes and Test tabs over a transcript. The transcript stays mounted and laid out under the other
 * tabs, only invisible, so its scroll position and scroll-follow carry on.
 */
function ChatTabs({ chatKey, media, revision, items, cwd, agentHost, processesPane, processesRunning = 0, transcriptOnly = false, children }: TabsProps) {
  const chosen = useChatMediaStore((s) => s.tab[chatKey])
  const setTab = useChatMediaStore((s) => s.setTab)
  const agents = useChatAgents(items, agentHost, cwd)
  const agentCount = useMemo(() => flatAgents(agents).length, [agents])
  const agentsWorking = useMemo(() => agentTabCount(agents), [agents])
  const tab = transcriptOnly ? 'chat' : shownTab(chosen, media.length, agentCount, processesPane !== undefined)
  const testFlow = useSessionTestFlow(items, cwd)
  const testFlowChanged = useTestFlowDot(testFlow.view, tab === 'test')
  const regionRef = useRef<HTMLDivElement | null>(null)
  const jumpTo = useRef<string | null>(null)

  const setHasMedia = useChatMediaStore((s) => s.setHasMedia)
  useEffect(() => setHasMedia(chatKey, media.length > 0), [chatKey, media.length, setHasMedia])

  // Focus left in the hidden transcript would let keys scroll it unseen and stop it following.
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (tab === 'chat' || !transcriptRef.current?.contains(document.activeElement)) return
    if (gridRef.current) gridRef.current.focus()
    else (document.activeElement as HTMLElement | null)?.blur()
  }, [tab])

  const jump = useCallback(
    (messageId: string) => {
      jumpTo.current = messageId
      setTab(chatKey, 'chat')
    },
    [chatKey, setTab]
  )
  useLayoutEffect(() => {
    const id = jumpTo.current
    if (tab !== 'chat' || id === null) return
    jumpTo.current = null
    regionRef.current?.querySelector(`[data-item-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })
  }, [tab])

  const tabs = useMemo(
    () => [
      { value: 'chat' as const, label: 'Chat', title: `The transcript (${MEDIA_TAB_SHORTCUT})` },
      ...(agentCount > 0 ? [{ value: 'agents' as const, label: 'Agents', count: agentsWorking, title: AGENTS_TITLE }] : []),
      ...(media.length > 0 ? [{ value: 'media' as const, label: 'Media', count: media.length, title: `This session's images, videos and 3D models (${MEDIA_TAB_SHORTCUT})` }] : []),
      ...(processesPane !== undefined
        ? [{ value: 'processes' as const, label: 'Processes', count: processesRunning > 0 ? processesRunning : undefined, title: PROCESSES_TITLE }]
        : []),
      { value: 'test' as const, label: 'Test', dot: testFlowChanged ? 'changed' : undefined, title: "This session's test flow" }
    ],
    [agentCount, agentsWorking, media.length, processesPane, processesRunning, testFlowChanged]
  )
  const hidden = tab !== 'chat'
  return (
    <>
      {!transcriptOnly && <TabStrip<ChatTab> label="Chat, agents, media, processes or test" value={tab} onChange={(t) => setTab(chatKey, t)} tabs={tabs} />}
      <div ref={regionRef} className="relative flex min-h-0 flex-1 flex-col">
        <div ref={transcriptRef} className={'flex min-h-0 flex-1 flex-col' + (hidden ? ' invisible' : '')} aria-hidden={hidden || undefined}>
          {children}
        </div>
        {tab === 'media' && <MediaGrid ref={gridRef} media={media} cwd={cwd} revision={revision} onJump={jump} />}
        {tab === 'test' && <TestFlowPanel {...testFlow} onPopOut={popOut} />}
        {tab === 'agents' && <AgentsPanel chatKey={chatKey} agents={agents} items={items} host={agentHost} cwd={cwd} />}
        {tab === 'processes' && processesPane !== undefined && <ProcessesPanel paneId={processesPane} />}
      </div>
    </>
  )
}

/** A hosted chat's transcript under its Chat, Agents, Media, Processes and Test tabs. */
export function HostedMediaTabs({ paneId, cwd, agents, transcriptOnly, children }: { paneId: string; cwd: string; agents: AgentHost; transcriptOnly?: boolean; children: ReactNode }) {
  const session = useHostedMedia(paneId, cwd)
  const processes = usePaneProcesses(paneId)
  const running = useMemo(() => runningCount(processes), [processes])
  return (
    <ChatTabs chatKey={paneId} {...session} cwd={cwd} agentHost={agents} processesPane={paneId} processesRunning={running} transcriptOnly={transcriptOnly}>
      {children}
    </ChatTabs>
  )
}

/** The followed VS Code session's transcript under its Chat, Agents, Media and Test tabs. */
export function ObservedMediaTabs({ sessionId, cwd, agents, children }: { sessionId: string; cwd: string | undefined; agents: AgentHost; children: ReactNode }) {
  const session = useObservedMedia(cwd)
  return (
    <ChatTabs chatKey={mediaKeyOf({ kind: 'observed', sessionId })} {...session} cwd={cwd} agentHost={agents}>
      {children}
    </ChatTabs>
  )
}
