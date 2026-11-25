import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { compactMetadata } from './compaction'
import { ChatItems } from './ChatItems'
import { HostedMediaTabs } from './MediaTabs'
import { MessageColumn } from './MessageColumn'
import { ChatBanner } from './ChatBanner'
import { Button } from '../ui/Button'
import type {
  AssistantMessageItem,
  ChatItem,
  ResultItem,
  ToolResultItem
} from './types'
import { InputBox } from './InputBox'
import { ApprovalPrompt } from './ApprovalPrompt'
import { PermissionModePicker } from './PermissionModePicker'
import { interruptNote } from './interrupt'
import { pauseToSend, suggestionReducer, type SuggestionClear } from './promptSuggestion'
import { useHostedChatOnScreen } from '../../hooks/useHostedChatOnScreen'
import { useStableCallback } from '../../hooks/useStableCallback'
import { UserPrompt } from './Message'
import { pickUp, type HeldPrompt } from './heldPrompts'
import { historyEntries } from './promptHistory'
import { sentAttachments } from './userAttachments'
import { fillThumbnails } from '../../state/sentThumbnails'
import { promptContent, terminalSnapshots, type PromptAttachment } from './attachments'
import { readTerminal } from '../../state/terminalBuffers'
import { overlayOpen } from '../ui/overlay'
import { useHeldPromptsStore } from '../../state/heldPromptsStore'
import { takeChatSends, takeSendRequest, takeStartRequest, useChatSendsStore } from '../../state/startRequests'
import { committedLength, thinkingDurations } from './liveItems'
import { applyDeltas, frameBatch, landAfterWaitingDeltas, type FrameBatch, type StreamDelta } from './streamDeltas'
import { useFollowOutput } from './useFollowOutput'
import { noteScroll, saveDraft, savedDraft, savedScroll } from '../../state/restoreStore'
import { useChatItemsStore } from '../../state/chatItemsStore'
import { useChatMediaStore } from '../../state/chatMediaStore'
import { mediaAttachments } from './chatMedia'
import { useSubagentTasksStore } from '../../state/subagentTasksStore'
import type { AgentHost, BackgroundHost } from './toolContext'
import { WorkingLine } from './WorkingLine'
import { AgentsStillWorking } from './AgentsStillWorking'
import { applyForegroundEvent, backgroundOutcome, type BackgroundOutcome, type ForegroundCalls } from './runInBackground'
import { findSessionByPane, shellTabsOfSession, storedPermissionMode, useProjectViewsStore } from '../../state/projectViewsStore'
import { isFirstPrompt, noteClaudeSessionId, requestClaudeTitle } from '../../state/sessionTitleSync'
import { useApprovalsStore } from '../../state/approvalsStore'
import { useAccountSwitchStore } from '../../state/accountSwitchStore'
import { availableModes, initialMode, isPermissionMode, migrateMode, nextMode, type PermissionMode } from '../../state/permissionModes'
import { NOT_RUNNING, controlOnceStarted } from './launchGate'
import { switchSessionMode } from '../../state/sessionMode'
import type { ApprovalRequest } from '../../../shared/approval'
import { useFocusRequestStore } from '../../state/sessionNavigation'
import { useSessionInit, useSessionInitStore } from '../../state/sessionInitStore'
import { defaultsOf, useModelStore } from '../../state/modelStore'
import { useModelChoice } from '../../state/useModelChoice'
import { DEFAULT_MODEL, effortLabel, launchChoice, versionedName } from '../../state/modelPicker'
import { useGeneralSettingsStore } from '../../state/generalSettingsStore'
import { ModelPicker } from './ModelPicker'
import { EffortPicker } from './EffortPicker'
import { ContextPie } from './ContextPie'
import { ContextDialog } from './ContextDialog'
import { contextIndicator, parseContextUsage, type ContextUsage } from './contextUsage'
import type { LocalAction, OpenTarget } from './slashMenuModel'
import { useUsagePopoverStore } from '../../state/usagePopoverStore'
import { Brain } from 'lucide-react'
import { RemoteControlPill } from './RemoteControlPill'
import { REMOTE_CONTROL_COMMAND, REMOTE_CONTROL_DESCRIPTION, isRemoteControlCommand, remoteControlOffered } from './remoteControl'
import { remoteControlOf, useRemoteControlStore } from '../../state/remoteControlStore'
import { DEFAULT_PROFILE_ID, THINKING_BUDGET } from '../../../shared/types'
import type {
  ClaudeAssistantEvent,
  ClaudeEvent,
  ClaudeResultEvent,
  ClaudeStreamEvent,
  ClaudeSystemEvent,
  ContentBlock
} from '../../../shared/types'

const EMPTY_ITEMS: ChatItem[] = []
const EMPTY_REQUESTS: ApprovalRequest[] = []
const EMPTY_HELD: HeldPrompt[] = []
const NO_TASKS = {}
const NO_FOREGROUND: ForegroundCalls = new Map()
const TASK_EVENTS: ReadonlySet<string> = new Set(['task_started', 'task_progress', 'task_notification', 'task_updated'])

/** The extension saves these as the default for new sessions when the user picks them. */
const DEFAULT_WORTHY: ReadonlySet<PermissionMode> = new Set(['default', 'auto', 'acceptEdits'])

/** The extension's own menu rows the app can run, with its wording. */
const LOCAL_ACTIONS: readonly LocalAction[] = [
  { id: 'attach-file', section: 'Context', label: 'Attach file…', description: 'Upload a file to include in conversation' },
  { id: 'mention-file', section: 'Context', label: 'Mention file from this project…', description: 'Reference a project file with @mention' },
  { id: 'model', section: 'Model', label: 'Switch model…', description: 'Change the AI model' },
  { id: 'toggle-thinking', section: 'Model', label: 'Thinking', description: 'Toggle extended thinking mode', keepOpen: true },
  { id: 'account-usage', section: 'Model', label: 'Account & usage…', description: 'View account info and usage' }
]

/** Registered only while Remote Control is offered, as the extension's `$u.remoteControl` row. */
const REMOTE_CONTROL_ACTION: LocalAction = {
  id: REMOTE_CONTROL_COMMAND,
  section: 'Slash Commands',
  label: `/${REMOTE_CONTROL_COMMAND}`,
  description: REMOTE_CONTROL_DESCRIPTION
}
const WITH_REMOTE_CONTROL: readonly LocalAction[] = [...LOCAL_ACTIONS, REMOTE_CONTROL_ACTION]

interface Props {
  paneId: string
  cwd: string
  model?: string
  effort?: string
  thinking?: boolean
  resumeSessionId?: string
  permissionMode?: string
  addDirs?: readonly string[]
  /** The account a chat not started yet will run on. */
  profileId?: string
  registerFocus?: (fn: () => void) => void
  /** The transcript without its Agents, Media, Processes and Test tabs, as the Dashboard's chat drawer shows it. */
  transcriptOnly?: boolean
}

function isToolResultBlock(
  block: ContentBlock
): block is { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean } {
  return block.type === 'tool_result'
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

function formatInitNote(init: ClaudeSystemEvent): string {
  const model = (init.model as string) ?? 'unknown model'
  const sid = (init.session_id as string) ?? ''
  const slashCount = Array.isArray(init.slash_commands) ? init.slash_commands.length : 0
  const mcpServers = Array.isArray(init.mcp_servers) ? init.mcp_servers.length : 0
  const parts = [`claude code · ${model}`]
  if (sid) parts.push(`session: ${sid.slice(0, 8)}…`)
  if (slashCount > 0) parts.push(`${slashCount} slash commands`)
  if (mcpServers > 0) parts.push(`${mcpServers} mcp server(s)`)
  return parts.join(' · ')
}

interface AnthropicStreamInner {
  type: string
  index?: number
  content_block?: ContentBlock
  delta?: StreamDelta['delta']
  message?: { id?: string }
}

export const ChatView = memo(function ChatView({
  paneId,
  cwd,
  model,
  effort,
  thinking = true,
  resumeSessionId,
  permissionMode,
  addDirs,
  profileId,
  registerFocus,
  transcriptOnly = false
}: Props) {
  const items = useChatItemsStore((s) => s.items[paneId] ?? EMPTY_ITEMS)
  const appendItems = useChatItemsStore((s) => s.appendItems)
  const mergeAssistant = useChatItemsStore((s) => s.mergeAssistant)
  const pendingApprovals = useApprovalsStore((s) => s.byPane[paneId] ?? EMPTY_REQUESTS)
  const held = useHeldPromptsStore((s) => s.byPane[paneId] ?? EMPTY_HELD)
  const outsideSends = useChatSendsStore((s) => s.byPane[paneId]?.length ?? 0)
  const historyRef = useRef<string[]>([])
  // The same list while the prompts stay the same, so an item commit does not redraw the prompt box.
  const history = useMemo(() => {
    const next = historyEntries(items, held)
    if (!sameStrings(next, historyRef.current)) historyRef.current = next
    return historyRef.current
  }, [items, held])

  const [processRunning, setProcessRunning] = useState(false)
  const [turnActive, setTurnActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inProgress, setInProgress] = useState<AssistantMessageItem | null>(null)
  const [thinkingTokens, setThinkingTokens] = useState<number | undefined>(undefined)
  const [foreground, setForeground] = useState<ForegroundCalls>(NO_FOREGROUND)
  const [backgroundRefused, setBackgroundRefused] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const clearSuggestion = (reason: SuggestionClear): void => setSuggestion((s) => suggestionReducer(s, { type: 'clear', reason }))
  const deltasRef = useRef<FrameBatch<StreamDelta> | null>(null)
  deltasRef.current ??= frameBatch((pending) => setInProgress((prev) => (prev ? applyDeltas(prev, pending) : prev)))
  const deltaBatch = deltasRef.current
  /** When each thinking block of the streaming message started, by block index. */
  const thinkingStartsRef = useRef<{ messageId: string | undefined; starts: Map<number, number> }>({ messageId: undefined, starts: new Map() })
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const closeContext = useCallback(() => setContextOpen(false), [])
  const [initCommandNames, setInitCommandNames] = useState<string[]>([])
  const [modelMenuSignal, setModelMenuSignal] = useState(0)
  const sessionInit = useSessionInit(paneId)
  const remoteControl = useRemoteControlStore((s) => remoteControlOf(s.byPane, paneId))
  const remoteControlAvailable = sessionInit?.remoteControl?.available
  const remoteControlShown = remoteControlOffered(remoteControlAvailable, remoteControl)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const { toBottom } = useFollowOutput(scrollRef, contentRef, { saved: savedScroll(paneId), onScrolled: (s) => noteScroll(paneId, s) })
  const initialItemsCountRef = useRef(items.length)
  const focusInputRef = useRef<(() => void) | null>(null)
  const paneRef = useRef<HTMLDivElement | null>(null)
  const focusRequest = useFocusRequestStore((s) => (s.request?.paneId === paneId ? s.request.nonce : null))
  const launchedModeRef = useRef<string | undefined>(undefined)
  const launchedBypassRef = useRef<boolean | null>(null)
  const startingRef = useRef<Promise<boolean> | null>(null)
  /** Set on a successful start before `processRunning` renders, so no caller launches twice. */
  const startedRef = useRef(false)
  const interruptedRef = useRef(false)
  const awaitingSummaryRef = useRef(false)
  const allowBypassSetting = useGeneralSettingsStore((s) => s.allowDangerouslySkipPermissions)
  const promptSuggestionsSetting = useGeneralSettingsStore((s) => s.promptSuggestions)
  const onScreen = useHostedChatOnScreen(paneId)
  /** What the running process was told; a new process starts unpaused. */
  const suggestionsPausedRef = useRef(false)
  const launchedSuggestionsRef = useRef(false)
  const launchCountRef = useRef(0)
  const choice = useModelChoice(paneId, { model, effort }, profileId)
  const mode = migrateMode(permissionMode)
  const autoAvailable = choice.entry?.supportsAutoMode === true
  // A running process can switch to bypass only if it was launched allowing it.
  const bypassAllowed = processRunning ? launchedBypassRef.current === true : allowBypassSetting
  const bypassAvailable = bypassAllowed || launchedModeRef.current === 'bypassPermissions' || mode === 'bypassPermissions'
  const modes = useMemo(() => availableModes({ current: mode, autoAvailable, bypassAvailable }), [mode, autoAvailable, bypassAvailable])

  const note = (text: string): void => appendItems(paneId, [{ kind: 'system', id: crypto.randomUUID(), text, at: Date.now() }])

  const control = (subtype: string, fields?: Record<string, unknown>) =>
    controlOnceStarted(() => window.api.claude.control(paneId, subtype, fields), startingRef.current)

  /** False when the running process refused the change; a pane without a process always takes it. */
  const applyFlags = async (settings: Record<string, unknown>): Promise<boolean> => {
    const res = await control('apply_flag_settings', { settings })
    if (res.ok) await useModelStore.getState().refreshApplied(paneId)
    else if (res.error !== NOT_RUNNING) setError(res.error)
    return res.ok || res.error === NOT_RUNNING
  }

  const pickProfile = (): string => useSessionInitStore.getState().processByPane[paneId]?.profileId ?? profileId ?? DEFAULT_PROFILE_ID

  const pickModel = async (value: string): Promise<void> => {
    const setting = value === DEFAULT_MODEL ? null : value
    if (!(await applyFlags({ model: setting }))) return
    useProjectViewsStore.getState().setSessionModel(paneId, value)
    const picked = choice.models.find((m) => m.value === value)
    note(`Set model to ${picked ? versionedName(picked) : value}`)
    useModelStore.getState().recordPick(pickProfile(), { model: value })
    await useModelStore.getState().saveDefaults({ model: setting })
  }

  const pickEffort = async (level: string): Promise<void> => {
    if (!(await applyFlags({ effortLevel: level }))) return
    useProjectViewsStore.getState().setSessionEffort(paneId, level)
    note(`Set effort to ${effortLabel(level)}`)
    useModelStore.getState().recordPick(pickProfile(), { effort: level })
    const resolvedModel = useModelStore.getState().applied[paneId]?.model ?? choice.entry?.resolvedModel
    if (resolvedModel) await useModelStore.getState().saveDefaults({ effort: { resolvedModel, level } })
  }

  const toggleThinking = async (): Promise<void> => {
    const on = !thinking
    const res = await control('set_max_thinking_tokens', { max_thinking_tokens: on ? THINKING_BUDGET : 0 })
    if (!res.ok && res.error !== NOT_RUNNING) {
      setError(res.error)
      return
    }
    useProjectViewsStore.getState().setSessionThinking(paneId, on)
    note(on ? 'Thinking on' : 'Thinking off')
  }

  const setMode = async (next: PermissionMode): Promise<boolean> => {
    const failed = await switchSessionMode(paneId, next, (fields) => control('set_permission_mode', fields))
    if (failed) setError(failed)
    return failed === null
  }

  const pickMode = async (next: PermissionMode): Promise<void> => {
    if ((await setMode(next)) && DEFAULT_WORTHY.has(next)) useProjectViewsStore.getState().setDefaultPermissionMode(next)
  }

  const registerInputFocus = useCallback(
    (fn: () => void) => {
      focusInputRef.current = fn
      registerFocus?.(fn)
    },
    [registerFocus]
  )

  useEffect(() => {
    if (focusRequest === null) return
    // The pane turns visible in this same commit; focus once the browser has applied it.
    const frame = requestAnimationFrame(() => {
      const firstChoice = paneRef.current?.querySelector<HTMLButtonElement>('[data-choice-prompt] button')
      if (firstChoice) firstChoice.focus()
      else focusInputRef.current?.()
      useFocusRequestStore.getState().clear()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])

  useEffect(() => {
    if (!processRunning || !launchedSuggestionsRef.current) return
    const paused = pauseToSend(suggestionsPausedRef.current, onScreen)
    if (paused === null) return
    suggestionsPausedRef.current = paused
    const launch = launchCountRef.current
    void window.api.claude.control(paneId, 'set_prompt_suggestions_paused', { paused }).then((res) => {
      if (res.ok) return
      console.error('[claude] set_prompt_suggestions_paused failed', paneId, res.error)
      // A reply from an earlier process must not touch what the current one was told.
      if (launch === launchCountRef.current && suggestionsPausedRef.current === paused) suggestionsPausedRef.current = !paused
    })
  }, [paneId, onScreen, processRunning])

  useEffect(() => {
    if (turnActive) setSuggestion((s) => suggestionReducer(s, { type: 'clear', reason: 'turn-started' }))
  }, [turnActive])

  useEffect(() => {
    const unsubEvent = window.api.claude.onEvent(({ paneId: id, event }) => {
      if (id !== paneId) return
      handleEvent(event as ClaudeEvent)
    })
    const unsubExit = window.api.claude.onExit(({ paneId: id }) => {
      if (id !== paneId) return
      startedRef.current = false
      useSubagentTasksStore.getState().end(paneId)
      setForeground(NO_FOREGROUND)
      setBackgroundRefused(false)
      setCompacting(false)
      clearSuggestion('restarted')
      setProcessRunning(false)
      setTurnActive(false)
      deltaBatch.cancel()
      setInProgress(null)
      release(useHeldPromptsStore.getState().byPane[paneId] ?? [])
      useHeldPromptsStore.getState().set(paneId, [])
      appendItems(paneId, [
        { kind: 'system', id: crypto.randomUUID(), text: 'claude process exited', at: Date.now() }
      ])
    })

    const first = takeSendRequest(paneId)
    if (first !== undefined) void handleSend(first.prompt).then(first.delivered, () => first.delivered(false))
    else if (takeStartRequest(paneId) || (initialItemsCountRef.current === 0 && !resumeSessionId)) {
      void ensureStarted()
    }

    return () => {
      unsubEvent()
      unsubExit()
      deltaBatch.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId])

  const handleStreamEvent = (inner: AnthropicStreamInner) => {
    if (inner.type === 'message_start') {
      thinkingStartsRef.current = { messageId: inner.message?.id, starts: new Map() }
      setThinkingTokens(undefined)
      setInProgress({
        kind: 'assistant',
        id: inner.message?.id ?? crypto.randomUUID(),
        content: [],
        raw: { type: 'assistant', message: { id: inner.message?.id ?? '', role: 'assistant', content: [] } } as ClaudeAssistantEvent
      })
      return
    }
    if (inner.type === 'content_block_start' && inner.content_block && typeof inner.index === 'number') {
      const idx = inner.index
      const block = inner.content_block
      if (block.type === 'thinking') {
        thinkingStartsRef.current.starts.set(idx, Date.now())
        setThinkingTokens(undefined)
      }
      setInProgress((prev) => {
        if (!prev) return prev
        const content = [...prev.content]
        while (content.length <= idx) content.push({ type: 'text', text: '' })
        // Initialize text blocks with empty text; tool_use comes through but input streams later
        if (block.type === 'text') {
          content[idx] = { type: 'text', text: '' }
        } else {
          content[idx] = block
        }
        return { ...prev, content }
      })
      return
    }
    if (inner.type === 'content_block_delta' && typeof inner.index === 'number' && inner.delta) {
      deltaBatch.push({ index: inner.index, delta: inner.delta })
      return
    }
    if (inner.type === 'message_stop') {
      // Each block was committed by its own 'assistant' event already.
      setInProgress(null)
      return
    }
  }

  const release = (prompts: HeldPrompt[]): void => {
    if (prompts.length === 0) return
    appendItems(
      paneId,
      prompts.flatMap((p): ChatItem[] => [
        { kind: 'user', id: p.uuid, text: p.text, ...(p.attachments ? { attachments: p.attachments } : {}), at: Date.now() },
        ...(p.notice ? [{ kind: 'system' as const, id: crypto.randomUUID(), text: p.notice, at: Date.now() }] : [])
      ])
    )
  }

  /** False for anything but `command_lifecycle` and replay echoes, which the rest of handleEvent must not see. */
  const handleQueueFrame = (event: ClaudeEvent): boolean => {
    const isReplay = event.type === 'user' && (event as { isReplay?: unknown }).isReplay === true
    if (!isReplay && event.type !== 'command_lifecycle') return false
    const store = useHeldPromptsStore.getState()
    const pickup = pickUp(store.byPane[paneId] ?? [], event)
    store.set(paneId, pickup.held)
    release(pickup.pickedUp)
    if (pickup.startsTurn) setTurnActive(true)
    return true
  }

  const handleEvent = (event: ClaudeEvent) => {
    landAfterWaitingDeltas(deltaBatch, event)
    const sessId = (event as { session_id?: string }).session_id
    if (sessId) noteClaudeSessionId(paneId, sessId)
    if (handleQueueFrame(event)) return
    if (event.type === 'prompt_suggestion') {
      setSuggestion((s) => suggestionReducer(s, { type: 'line', line: event }))
      return
    }

    const parent = (event as { parent_tool_use_id?: unknown }).parent_tool_use_id
    const parentToolUseId = typeof parent === 'string' && parent !== '' ? parent : undefined
    if (event.type === 'stream_event') {
      const se = event as ClaudeStreamEvent
      // Only the main agent's message streams in place; a subagent's arrives whole.
      if (parentToolUseId) return
      handleStreamEvent(se.event as AnthropicStreamInner)
      return
    }
    if (event.type === 'system') {
      const sys = event as ClaudeSystemEvent
      if (sys.subtype === 'status') {
        // The extension's rule: a hooks-only status line leaves the status as it was.
        if (!('userPromptSubmitHooksRunning' in sys)) setCompacting(sys.status === 'compacting')
        if (isPermissionMode(sys.permissionMode) && sys.permissionMode !== storedPermissionMode(paneId)) useProjectViewsStore.getState().setSessionPermissionMode(paneId, sys.permissionMode)
        return
      }
      if (TASK_EVENTS.has(sys.subtype)) {
        setForeground((calls) => applyForegroundEvent(calls, sys))
        useSubagentTasksStore.getState().apply(paneId, sys)
        return
      }
      if (sys.subtype === 'thinking_tokens') {
        if (typeof sys.estimated_tokens === 'number') setThinkingTokens(sys.estimated_tokens)
        return
      }
      if (sys.subtype === 'compact_boundary') {
        setContextUsage((u) => (u ? { ...u, totalTokens: 0 } : u))
        if (!parentToolUseId) {
          appendItems(paneId, [{ kind: 'system', id: crypto.randomUUID(), text: '', compact: compactMetadata(sys.compact_metadata), at: Date.now() }])
          awaitingSummaryRef.current = true
        }
        return
      }
      if (sys.subtype === 'init') {
        if (Array.isArray(sys.slash_commands)) setInitCommandNames(sys.slash_commands.filter((n): n is string => typeof n === 'string'))
        appendItems(paneId, [
          { kind: 'system', id: crypto.randomUUID(), text: formatInitNote(sys), at: Date.now() }
        ])
      }
      return
    }
    if (event.type === 'assistant') {
      const ae = event as ClaudeAssistantEvent
      const id = ae.message.id ?? crypto.randomUUID()
      if (parentToolUseId) {
        mergeAssistant(paneId, { kind: 'assistant', id, content: ae.message.content, raw: ae, at: Date.now(), parentToolUseId })
        return
      }
      const now = Date.now()
      const firstIndex = committedLength(useChatItemsStore.getState().items[paneId] ?? [], id)
      const timing = thinkingStartsRef.current
      const thinkingMs = timing.messageId === id ? thinkingDurations(timing.starts, firstIndex, ae.message.content, now) : undefined
      mergeAssistant(paneId, { kind: 'assistant', id, content: ae.message.content, raw: ae, at: now, ...(thinkingMs ? { thinkingMs } : {}) })
      // A message from a subagent, or one sent without stream events, is not the one streaming.
      setInProgress((prev) => (prev && prev.id === id ? prev : null))
      return
    }
    if (event.type === 'user') {
      const user = event as { isSynthetic?: boolean; message?: { content?: ContentBlock[] | string } }
      const content = user.message?.content
      // The extension's `pendingCompactMessage`: the first synthetic prompt after a boundary is its summary.
      if (awaitingSummaryRef.current && !parentToolUseId && user.isSynthetic && typeof content === 'string') {
        awaitingSummaryRef.current = false
        appendItems(paneId, [{ kind: 'system', id: crypto.randomUUID(), text: '', compactSummary: content, at: Date.now() }])
        return
      }
      if (!Array.isArray(content)) return
      if (parentToolUseId) {
        const results: ToolResultItem[] = content.filter(isToolResultBlock).map((block) => ({
          kind: 'tool_result' as const,
          id: crypto.randomUUID(),
          toolUseId: block.tool_use_id,
          content: block.content,
          isError: block.is_error,
          at: Date.now(),
          parentToolUseId
        }))
        if (results.length > 0) appendItems(paneId, results)
        return
      }
      const notes = content.flatMap((block) => {
        const note = interruptNote(block)
        return note ? [note] : []
      })
      if (notes.length > 0) {
        interruptedRef.current = true
        appendItems(paneId, notes.map((text) => ({ kind: 'system' as const, id: crypto.randomUUID(), text, at: Date.now() })))
      }
      const results: ToolResultItem[] = content.filter(isToolResultBlock).map((block) => ({
        kind: 'tool_result' as const,
        id: crypto.randomUUID(),
        toolUseId: block.tool_use_id,
        content: block.content,
        isError: block.is_error,
        at: Date.now()
      }))
      if (results.length > 0) appendItems(paneId, results)
      return
    }
    if (event.type === 'result') {
      const re = event as ClaudeResultEvent
      void refreshContextUsage()
      if (interruptedRef.current) {
        interruptedRef.current = false
        setTurnActive(false)
        setInProgress(null)
        return
      }
      const item: ResultItem = {
        kind: 'result',
        id: crypto.randomUUID(),
        durationMs: re.duration_ms,
        costUsd: re.total_cost_usd,
        numTurns: re.num_turns,
        isError: re.is_error,
        raw: re,
        at: Date.now()
      }
      appendItems(paneId, [item])
      setTurnActive(false)
      setInProgress(null)
      return
    }
  }

  const refreshContextUsage = async (): Promise<void> => {
    const res = await window.api.claude.control(paneId, 'get_context_usage')
    if (!res.ok) return
    const usage = parseContextUsage(res.response)
    if (usage) setContextUsage(usage)
  }

  const openTarget = (target: OpenTarget): void => {
    if (target === 'model') setModelMenuSignal((n) => n + 1)
    else if (target === 'usage') useUsagePopoverStore.getState().open()
    else setContextOpen(true)
  }

  /** As the extension, turning it on starts the chat's process if needed and sends once it is up. */
  const toggleRemoteControl = (): Promise<void> =>
    useRemoteControlStore.getState().toggle(paneId, async (enabled) => {
      if (!enabled) return window.api.claude.control(paneId, 'remote_control', { enabled })
      if (!(await ensureStarted())) return { ok: false, error: NOT_RUNNING }
      return control('remote_control', { enabled })
    })

  const runAction = (id: string): void => {
    if (id === REMOTE_CONTROL_COMMAND) void toggleRemoteControl()
    else if (id === 'model') openTarget('model')
    else if (id === 'account-usage') openTarget('usage')
    else if (id === 'toggle-thinking') void toggleThinking()
  }

  /** A session's first start fixes its mode: the last pick, else the profile's settings.json, else Manual. */
  const launchMode = async (): Promise<PermissionMode> => {
    const own = storedPermissionMode(paneId)
    if (own) return own
    const fromSettings = await window.api.claude.defaultPermissionMode(cwd)
    const pickedMeanwhile = storedPermissionMode(paneId)
    if (pickedMeanwhile) return pickedMeanwhile
    const store = useProjectViewsStore.getState()
    const resolved = initialMode({ picked: store.defaultPermissionMode, fromSettings, bypassAllowed: allowBypassSetting })
    store.setSessionPermissionMode(paneId, resolved)
    return resolved
  }

  const ensureStarted = (): Promise<boolean> => {
    if (processRunning || startedRef.current) return Promise.resolve(true)
    startingRef.current ??= launch().finally(() => {
      startingRef.current = null
    })
    return startingRef.current
  }

  const launch = async (): Promise<boolean> => {
    setError(null)
    const startMode = await launchMode()
    launchedModeRef.current = startMode
    launchedBypassRef.current = allowBypassSetting
    launchedSuggestionsRef.current = promptSuggestionsSetting
    suggestionsPausedRef.current = false
    launchCountRef.current += 1
    const runsOn = profileId ?? DEFAULT_PROFILE_ID
    if (!(runsOn in useModelStore.getState().settingsByProfile)) await useModelStore.getState().loadDefaults(runsOn)
    const defaults = defaultsOf(useModelStore.getState().settingsByProfile, runsOn)
    const flags = launchChoice({ models: choice.models, defaults, selection: model, effort })
    const res = await window.api.claude.start({
      paneId,
      cwd,
      ...flags,
      thinking,
      resumeSessionId,
      permissionMode: startMode,
      addDirs,
      allowBypass: allowBypassSetting,
      promptSuggestions: promptSuggestionsSetting
    })
    if (!res.ok) {
      setError(res.error ?? 'failed to start claude')
      if (resumeSessionId) useProjectViewsStore.getState().clearClaudeSessionId(paneId)
      return false
    }
    if (res.profileId) useSessionInitStore.getState().started(paneId, res.profileId)
    startedRef.current = true
    setProcessRunning(true)
    void refreshContextUsage()
    return true
  }

  const switchTo = useAccountSwitchStore((s) => s.pending[paneId] ?? null)
  const switchPhaseRef = useRef<'waiting' | 'stopping' | null>(null)
  useEffect(() => {
    if (!switchTo) return
    const clear = () => useAccountSwitchStore.getState().clear(paneId)
    if (switchPhaseRef.current === null) {
      if (!processRunning) {
        clear()
        return
      }
      switchPhaseRef.current = 'waiting'
    }
    if (switchPhaseRef.current === 'waiting' && !processRunning) switchPhaseRef.current = 'stopping'
    if (switchPhaseRef.current === 'waiting' && !turnActive && held.length === 0) {
      switchPhaseRef.current = 'stopping'
      note(`switching profile to ${switchTo}; resuming this session on it`)
      window.api.claude.stop(paneId)
      return
    }
    if (switchPhaseRef.current === 'stopping' && !processRunning) {
      switchPhaseRef.current = null
      clear()
      void ensureStarted()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [switchTo, processRunning, turnActive, held.length])

  /** True once the prompt reached the running process; false when the process failed to start. */
  const handleSend = async (text: string, attachments: readonly PromptAttachment[] = []): Promise<boolean> => {
    if (attachments.length === 0 && remoteControlShown && isRemoteControlCommand(text)) {
      void toggleRemoteControl()
      return true
    }
    clearSuggestion('sent')
    const uuid = crypto.randomUUID()
    const shown = attachments.length > 0 ? { attachments: sentAttachments(attachments) } : {}
    useChatMediaStore.getState().addAttachments(paneId, mediaAttachments(uuid, attachments))
    // As the extension's `turnRunningOrQueued`: the CLI queues it and says when it starts.
    const queued = turnActive || held.length > 0
    if (queued) useHeldPromptsStore.getState().hold(paneId, { uuid, text, ...shown })
    else appendItems(paneId, [{ kind: 'user', id: uuid, text, ...shown, at: Date.now() }])
    if (attachments.length > 0) fillThumbnails(paneId, uuid, attachments)
    toBottom()
    const firstPrompt = isFirstPrompt(paneId)
    useProjectViewsStore.getState().notePrompt(paneId, text)
    const ok = await ensureStarted()
    if (!ok) {
      if (queued) {
        const store = useHeldPromptsStore.getState()
        store.set(paneId, (store.byPane[paneId] ?? []).filter((p) => p.uuid !== uuid))
      }
      return false
    }
    if (!queued) setTurnActive(true)
    const terminals = terminalSnapshots(text, shellTabsOfSession(paneId), readTerminal)
    window.api.claude.send(paneId, promptContent(text, attachments, terminals), uuid)
    requestClaudeTitle(paneId, text, firstPrompt)
    return true
  }

  /** Esc anywhere in the chat stops Claude, as the extension's document-level handler; menus and approvals take it first. */
  const handlePaneKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.repeat || e.nativeEvent.isComposing) return
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (!turnActive || pendingApprovals.length > 0 || overlayOpen()) return
    e.preventDefault()
    handleInterrupt()
  }

  const handleInterrupt = () => {
    clearSuggestion('interrupted')
    window.api.claude.interrupt(paneId)
    setTurnActive(false)
    deltaBatch.cancel()
    setInProgress(null)
  }

  const handleResume = async () => {
    await ensureStarted()
  }

  const subagentTasks = useSubagentTasksStore((s) => s.byPane[paneId] ?? NO_TASKS)
  const claudeSessionId = useProjectViewsStore((s) => findSessionByPane(s, paneId)?.session.claudeSessionId)
  const transcript = useMemo(() => (claudeSessionId ? { cwd, sessionId: claudeSessionId } : undefined), [cwd, claudeSessionId])
  const agents = useMemo((): AgentHost => {
    const stop = async (taskId: string): Promise<string | null> => {
      const res = await window.api.claude.control(paneId, 'stop_task', { task_id: taskId })
      return res.ok ? null : res.error
    }
    return {
      tasks: subagentTasks,
      running: processRunning,
      stop,
      chatKey: paneId,
      ...(transcript ? { transcript } : {})
    }
  }, [paneId, subagentTasks, processRunning, transcript])

  const background = useMemo((): BackgroundHost => {
    const move = async (toolUseIds: readonly string[]): Promise<BackgroundOutcome> => {
      const replies = await Promise.all(toolUseIds.map((id) => window.api.claude.control(paneId, 'background_tasks', { tool_use_id: id })))
      const outcome = backgroundOutcome(replies)
      if (outcome === 'disabled') setBackgroundRefused(true)
      return outcome
    }
    return { foreground, refused: backgroundRefused, move }
  }, [paneId, foreground, backgroundRefused])

  const indicator = useMemo(() => (contextUsage ? contextIndicator(contextUsage) : null), [contextUsage])
  const initialDraft = useMemo(() => savedDraft(paneId), [paneId])
  const onDraftChange = useStableCallback((text: string) => saveDraft(paneId, text))
  const onSend = useStableCallback(handleSend)
  useEffect(() => {
    if (outsideSends === 0) return
    for (const send of takeChatSends(paneId)) void onSend(send.prompt).then(send.delivered, () => send.delivered(false))
  }, [outsideSends, paneId, onSend])
  const onInterrupt = useStableCallback(handleInterrupt)
  const onDismissSuggestion = useStableCallback(() => clearSuggestion('dismissed'))
  const onAction = useStableCallback(runAction)
  const onOpen = useStableCallback(openTarget)
  const onShiftTab = useStableCallback(() => void pickMode(nextMode(modes, mode)))
  const onSelectModel = useStableCallback((m: string) => void pickModel(m))
  const onSelectEffort = useStableCallback((l: string) => void pickEffort(l))
  const onToggleThinking = useStableCallback(() => void toggleThinking())
  const onCompact = useStableCallback(() => void handleSend('/compact'))
  const onSelectMode = useStableCallback((m: PermissionMode) => void pickMode(m))
  const pillLabel = choice.pill.label
  const menuTrailing = useMemo(
    () => ({
      model: <span className="shrink-0 text-[11px] text-muted">{pillLabel}</span>,
      'toggle-thinking': <span className="shrink-0 text-[11px] text-muted">{thinking ? 'On' : 'Off'}</span>
    }),
    [pillLabel, thinking]
  )
  const footerStart = useMemo(
    () => (
      <>
        <ModelPicker models={choice.models} current={choice.selection} pill={choice.pill} onSelectModel={onSelectModel} openSignal={modelMenuSignal} />
        <EffortPicker level={choice.effort} levels={choice.levels} onSelect={onSelectEffort} />
        <Button variant="ghost" pressed={thinking} onClick={onToggleThinking} tooltip="Toggle extended thinking mode">
          <Brain size={13} strokeWidth={2} />
          <span className="input-footer-wide">Thinking</span>
        </Button>
      </>
    ),
    [choice, modelMenuSignal, thinking, onSelectModel, onSelectEffort, onToggleThinking]
  )
  const footerEnd = useMemo(
    () => (
      <>
        {indicator && <ContextPie indicator={indicator} onCompact={onCompact} />}
        {/* The extension's footer rule: once unavailable, only a connected session keeps its pill. */}
        {(remoteControl.status === 'connected' || remoteControlAvailable !== false) && <RemoteControlPill state={remoteControl} />}
        <PermissionModePicker mode={mode} modes={modes} onSelect={onSelectMode} />
      </>
    ),
    [indicator, remoteControl, remoteControlAvailable, mode, modes, onCompact, onSelectMode]
  )
  const commands = useMemo(
    () => sessionInit?.commands ?? initCommandNames.map((name) => ({ name, description: '', argumentHint: '', aliases: [], builtin: false })),
    [sessionInit, initCommandNames]
  )

  const showIdleBanner =
    items.length > 0 &&
    !processRunning &&
    !turnActive &&
    initialItemsCountRef.current > 0

  return (
    <div ref={paneRef} data-chat-pane className="flex h-full min-h-0 flex-col" onKeyDown={handlePaneKeyDown}>
      <HostedMediaTabs paneId={paneId} cwd={cwd} agents={agents} transcriptOnly={transcriptOnly}>
        <div ref={scrollRef} tabIndex={-1} data-transcript="" className="flex-1 overflow-y-auto px-5 py-4 focus:outline-none">
          {/* Positioned so the screen-reader status below stays inside the scroll box instead of stretching the Layer stack. */}
          <div ref={contentRef} className="relative">
            <MessageColumn className="space-y-3">
              {error && (
                <ChatBanner tone="error" action={<Button variant="secondary" onClick={() => setError(null)}>dismiss</Button>}>
                  {error}
                </ChatBanner>
              )}
              {items.length === 0 && !error && !processRunning && !inProgress && (
                <div className="py-10 text-center text-sm text-faint">starting claude…</div>
              )}
              {showIdleBanner && (
                <ChatBanner
                  action={
                    <Button variant="secondary" onClick={handleResume}>
                      {resumeSessionId ? 'resume now' : 'start'}
                    </Button>
                  }
                >
                  {resumeSessionId
                    ? 'paused — sending will resume this session'
                    : 'idle — sending will start a new claude process'}
                </ChatBanner>
              )}
              <ChatItems items={items} cwd={cwd} streaming={inProgress} thinkingTokens={thinkingTokens} agents={agents} busy={turnActive} background={background} />
              {pendingApprovals.map((req) => (
                <ApprovalPrompt key={req.requestId} request={req} autoAvailable={autoAvailable} onSetMode={setMode} />
              ))}
              {turnActive && pendingApprovals.length === 0 && <WorkingLine mode={mode} compacting={compacting} />}
              {held.map((p) => (
                <UserPrompt key={p.uuid} id={p.uuid} text={p.text} attachments={p.attachments} queued />
              ))}
              <div role="status" className="sr-only">
                {held.length > 0 ? 'Message queued.' : ''}
              </div>
            </MessageColumn>
          </div>
        </div>
      </HostedMediaTabs>
      <AgentsStillWorking paneId={paneId} turnActive={turnActive} transcript={transcript} />
      <InputBox
        busy={turnActive}
        initialDraft={initialDraft}
        onDraftChange={onDraftChange}
        history={history}
        onSend={onSend}
        onInterrupt={onInterrupt}
        suggestion={suggestion}
        onDismissSuggestion={onDismissSuggestion}
        commands={commands}
        localActions={remoteControlShown ? WITH_REMOTE_CONTROL : LOCAL_ACTIONS}
        onAction={onAction}
        onOpen={onOpen}
        menuTrailing={menuTrailing}
        cwd={cwd}
        registerFocus={registerInputFocus}
        footerStart={footerStart}
        footerEnd={footerEnd}
        onShiftTab={onShiftTab}
      />
      {contextOpen && <ContextDialog paneId={paneId} onClose={closeContext} />}
    </div>
  )
})
