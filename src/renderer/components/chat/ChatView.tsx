import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChatItems } from './ChatItems'
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
import { UserPrompt } from './Message'
import { pickUp, type HeldPrompt } from './heldPrompts'
import { historyEntries, userItemText } from './promptHistory'
import { promptContent, terminalSnapshots, type PromptAttachment } from './attachments'
import { readTerminal } from '../../state/terminalBuffers'
import { overlayOpen } from '../ui/overlay'
import { useHeldPromptsStore } from '../../state/heldPromptsStore'
import { committedLength, thinkingDurations } from './liveItems'
import { useFollowOutput } from './useFollowOutput'
import { noteScroll, saveDraft, savedDraft, savedScroll } from '../../state/restoreStore'
import { useChatItemsStore } from '../../state/chatItemsStore'
import { useSubagentTasksStore } from '../../state/subagentTasksStore'
import type { AgentHost } from './toolContext'
import { findSessionByPane, shellTabsOfSession, storedPermissionMode, useProjectViewsStore } from '../../state/projectViewsStore'
import { isFirstPrompt, noteClaudeSessionId, requestClaudeTitle } from '../../state/sessionTitleSync'
import { useApprovalsStore } from '../../state/approvalsStore'
import { useAccountSwitchStore } from '../../state/accountSwitchStore'
import { availableModes, initialMode, isPermissionMode, migrateMode, nextMode, type PermissionMode } from '../../state/permissionModes'
import { NOT_RUNNING, controlOnceStarted } from './launchGate'
import type { ApprovalRequest } from '../../../shared/approval'
import { useFocusRequestStore } from '../../state/sessionNavigation'
import { useSessionInit } from '../../state/sessionInitStore'
import { useModelStore } from '../../state/modelStore'
import { useModelChoice } from '../../state/useModelChoice'
import { DEFAULT_MODEL, effortLabel, launchChoice, versionedName } from '../../state/modelPicker'
import { useGeneralSettingsStore } from '../../state/generalSettingsStore'
import { ModelPicker } from './ModelPicker'
import { ContextPie } from './ContextPie'
import { ContextDialog } from './ContextDialog'
import { contextIndicator, parseContextUsage, type ContextUsage } from './contextUsage'
import type { LocalAction, OpenTarget } from './slashMenuModel'
import { useUsagePopoverStore } from '../../state/usagePopoverStore'
import { Brain } from 'lucide-react'
import { RemoteControlPill } from './RemoteControlPill'
import { REMOTE_CONTROL_COMMAND, REMOTE_CONTROL_DESCRIPTION, isRemoteControlCommand, remoteControlOffered } from './remoteControl'
import { remoteControlOf, useRemoteControlStore } from '../../state/remoteControlStore'
import { THINKING_BUDGET } from '../../../shared/types'
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
  registerFocus?: (fn: () => void) => void
}

function isToolResultBlock(
  block: ContentBlock
): block is { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean } {
  return block.type === 'tool_result'
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
  delta?: { type?: string; text?: string; thinking?: string; partial_json?: string }
  message?: { id?: string }
}

export function ChatView({
  paneId,
  cwd,
  model,
  effort,
  thinking = true,
  resumeSessionId,
  permissionMode,
  registerFocus
}: Props) {
  const items = useChatItemsStore((s) => s.items[paneId] ?? EMPTY_ITEMS)
  const appendItems = useChatItemsStore((s) => s.appendItems)
  const mergeAssistant = useChatItemsStore((s) => s.mergeAssistant)
  const pendingApprovals = useApprovalsStore((s) => s.byPane[paneId] ?? EMPTY_REQUESTS)
  const held = useHeldPromptsStore((s) => s.byPane[paneId] ?? EMPTY_HELD)
  const history = useMemo(() => historyEntries(items, held), [items, held])

  const [processRunning, setProcessRunning] = useState(false)
  const [turnActive, setTurnActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inProgress, setInProgress] = useState<AssistantMessageItem | null>(null)
  const [thinkingTokens, setThinkingTokens] = useState<number | undefined>(undefined)
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
  const allowBypassSetting = useGeneralSettingsStore((s) => s.allowDangerouslySkipPermissions)
  const choice = useModelChoice(paneId, { model, effort })
  const mode = migrateMode(permissionMode)
  const autoAvailable = choice.entry?.supportsAutoMode === true
  // A running process can switch to bypass only if it was launched allowing it.
  const bypassAllowed = processRunning ? launchedBypassRef.current === true : allowBypassSetting
  const modes = availableModes({
    current: mode,
    autoAvailable,
    bypassAvailable: bypassAllowed || launchedModeRef.current === 'bypassPermissions' || mode === 'bypassPermissions'
  })

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

  const pickModel = async (value: string): Promise<void> => {
    const setting = value === DEFAULT_MODEL ? null : value
    if (!(await applyFlags({ model: setting }))) return
    useProjectViewsStore.getState().setSessionModel(paneId, value)
    const picked = choice.models.find((m) => m.value === value)
    note(`Set model to ${picked ? versionedName(picked) : value}`)
    await useModelStore.getState().saveDefaults({ model: setting })
  }

  const pickEffort = async (level: string): Promise<void> => {
    if (!(await applyFlags({ effortLevel: level }))) return
    useProjectViewsStore.getState().setSessionEffort(paneId, level)
    note(`Set effort to ${effortLabel(level)}`)
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
    const store = useProjectViewsStore.getState()
    const previous = mode
    store.setSessionPermissionMode(paneId, next)
    const res = await control('set_permission_mode', { mode: next })
    if (res.ok || res.error === NOT_RUNNING) return true
    store.setSessionPermissionMode(paneId, previous)
    setError(res.error)
    return false
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
    const unsubEvent = window.api.claude.onEvent(({ paneId: id, event }) => {
      if (id !== paneId) return
      handleEvent(event as ClaudeEvent)
    })
    const unsubExit = window.api.claude.onExit(({ paneId: id }) => {
      if (id !== paneId) return
      startedRef.current = false
      useSubagentTasksStore.getState().end(paneId)
      setProcessRunning(false)
      setTurnActive(false)
      setInProgress(null)
      release(useHeldPromptsStore.getState().byPane[paneId] ?? [])
      useHeldPromptsStore.getState().set(paneId, [])
      appendItems(paneId, [
        { kind: 'system', id: crypto.randomUUID(), text: 'claude process exited', at: Date.now() }
      ])
    })

    if (initialItemsCountRef.current === 0 && !resumeSessionId) {
      void ensureStarted()
    }

    return () => {
      unsubEvent()
      unsubExit()
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
      const idx = inner.index
      const delta = inner.delta
      setInProgress((prev) => {
        if (!prev) return prev
        const content = [...prev.content]
        const block = content[idx]
        if (!block) return prev
        if (delta.type === 'text_delta' && block.type === 'text' && typeof delta.text === 'string') {
          content[idx] = { type: 'text', text: (block as { text: string }).text + delta.text }
        } else if (delta.type === 'thinking_delta' && block.type === 'thinking' && typeof delta.thinking === 'string') {
          content[idx] = { ...block, thinking: (typeof block.thinking === 'string' ? block.thinking : '') + delta.thinking }
        }
        return { ...prev, content }
      })
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
        { kind: 'user', id: p.uuid, text: p.text, at: Date.now() },
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
    const sessId = (event as { session_id?: string }).session_id
    if (sessId) noteClaudeSessionId(paneId, sessId)
    if (handleQueueFrame(event)) return

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
      if (sys.subtype === 'status' && isPermissionMode(sys.permissionMode)) {
        useProjectViewsStore.getState().setSessionPermissionMode(paneId, sys.permissionMode)
        return
      }
      if (TASK_EVENTS.has(sys.subtype)) {
        useSubagentTasksStore.getState().apply(paneId, sys)
        return
      }
      if (sys.subtype === 'thinking_tokens') {
        if (typeof sys.estimated_tokens === 'number') setThinkingTokens(sys.estimated_tokens)
        return
      }
      if (sys.subtype === 'compact_boundary') {
        setContextUsage((u) => (u ? { ...u, totalTokens: 0 } : u))
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
      const content = (event as { message?: { content?: ContentBlock[] } }).message?.content
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
    const { defaults } = useModelStore.getState()
    const flags = launchChoice({ models: choice.models, defaults, selection: model, effort })
    const res = await window.api.claude.start({
      paneId,
      cwd,
      ...flags,
      thinking,
      resumeSessionId,
      permissionMode: startMode,
      allowBypass: allowBypassSetting
    })
    if (!res.ok) {
      setError(res.error ?? 'failed to start claude')
      if (resumeSessionId) useProjectViewsStore.getState().clearClaudeSessionId(paneId)
      return false
    }
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

  const handleSend = async (text: string, attachments: readonly PromptAttachment[] = []) => {
    if (attachments.length === 0 && remoteControlShown && isRemoteControlCommand(text)) {
      void toggleRemoteControl()
      return
    }
    const uuid = crypto.randomUUID()
    const userText = userItemText(text, attachments)
    // As the extension's `turnRunningOrQueued`: the CLI queues it and says when it starts.
    const queued = turnActive || held.length > 0
    if (queued) useHeldPromptsStore.getState().hold(paneId, { uuid, text: userText })
    else appendItems(paneId, [{ kind: 'user', id: uuid, text: userText, at: Date.now() }])
    toBottom()
    const firstPrompt = isFirstPrompt(paneId)
    useProjectViewsStore.getState().notePrompt(paneId, text)
    const ok = await ensureStarted()
    if (!ok) {
      if (queued) {
        const store = useHeldPromptsStore.getState()
        store.set(paneId, (store.byPane[paneId] ?? []).filter((p) => p.uuid !== uuid))
      }
      return
    }
    if (!queued) setTurnActive(true)
    const terminals = terminalSnapshots(text, shellTabsOfSession(paneId), readTerminal)
    window.api.claude.send(paneId, promptContent(text, attachments, terminals), uuid)
    requestClaudeTitle(paneId, text, firstPrompt)
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
    window.api.claude.interrupt(paneId)
    setTurnActive(false)
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
      ...(transcript ? { transcript } : {})
    }
  }, [paneId, subagentTasks, processRunning, transcript])

  const indicator = contextUsage ? contextIndicator(contextUsage) : null
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
            <ChatItems items={items} cwd={cwd} streaming={inProgress} thinkingTokens={thinkingTokens} agents={agents} />
            {pendingApprovals.map((req) => (
              <ApprovalPrompt key={req.requestId} request={req} autoAvailable={autoAvailable} onSetMode={setMode} />
            ))}
            {turnActive && !inProgress && pendingApprovals.length === 0 && (
              <div className="px-1.5 text-xs text-faint">claude is thinking…</div>
            )}
            {held.map((p) => (
              <UserPrompt key={p.uuid} text={p.text} queued />
            ))}
            <div role="status" className="sr-only">
              {held.length > 0 ? 'Message queued.' : ''}
            </div>
          </MessageColumn>
        </div>
      </div>
      <InputBox
        busy={turnActive}
        initialDraft={savedDraft(paneId)}
        onDraftChange={(text) => saveDraft(paneId, text)}
        history={history}
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        commands={commands}
        localActions={remoteControlShown ? WITH_REMOTE_CONTROL : LOCAL_ACTIONS}
        onAction={runAction}
        onOpen={openTarget}
        menuTrailing={{
          model: <span className="shrink-0 text-[11px] text-muted">{choice.pill.label}</span>,
          'toggle-thinking': <span className="shrink-0 text-[11px] text-muted">{thinking ? 'On' : 'Off'}</span>
        }}
        cwd={cwd}
        registerFocus={registerInputFocus}
        footerStart={
          <>
            <ModelPicker
              models={choice.models}
              current={choice.selection}
              pill={choice.pill}
              effort={choice.effort}
              levels={choice.levels}
              onSelectModel={(m) => void pickModel(m)}
              onSelectEffort={(l) => void pickEffort(l)}
              openSignal={modelMenuSignal}
            />
            <Button variant="ghost" pressed={thinking} onClick={() => void toggleThinking()} tooltip="Toggle extended thinking mode">
              <Brain size={13} strokeWidth={2} />
              Thinking
            </Button>
          </>
        }
        footerEnd={
          <>
            {indicator && <ContextPie indicator={indicator} onCompact={() => void handleSend('/compact')} />}
            {/* The extension's footer rule: once unavailable, only a connected session keeps its pill. */}
            {(remoteControl.status === 'connected' || remoteControlAvailable !== false) && <RemoteControlPill state={remoteControl} />}
            <PermissionModePicker
              mode={mode}
              modes={modes}
              onSelect={(m) => void pickMode(m)}
              effort={{ level: choice.effort, levels: choice.levels, onSelect: (l) => void pickEffort(l) }}
            />
          </>
        }
        onShiftTab={() => void pickMode(nextMode(modes, mode))}
      />
      {contextOpen && <ContextDialog paneId={paneId} onClose={closeContext} />}
    </div>
  )
}
