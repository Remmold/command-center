import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useChatItemsStore } from '../../state/chatItemsStore'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { useApprovalsStore } from '../../state/approvalsStore'
import { availableModes, isPermissionMode, migrateMode, nextMode, type PermissionMode } from '../../state/permissionModes'
import type { ApprovalRequest } from '../../../shared/approval'
import { useFocusRequestStore } from '../../state/sessionNavigation'
import { useSessionInit } from '../../state/sessionInitStore'
import { useModelStore } from '../../state/modelStore'
import { useModelChoice } from '../../state/useModelChoice'
import { DEFAULT_MODEL, effortLabel, launchChoice, versionedName } from '../../state/modelPicker'
import { useGeneralSettingsStore } from '../../state/generalSettingsStore'
import { ModelPicker } from './ModelPicker'
import { Brain } from 'lucide-react'
import { THINKING_BUDGET } from '../../../shared/types'
import type {
  ClaudeAssistantEvent,
  ClaudeEvent,
  ClaudeResultEvent,
  ClaudeStreamEvent,
  ClaudeSystemEvent,
  ContentBlock,
  ImageAttachment
} from '../../../shared/types'

const EMPTY_ITEMS: ChatItem[] = []
const NOT_RUNNING = 'claude process is not running'
const EMPTY_REQUESTS: ApprovalRequest[] = []

/** The extension saves these as the default for new sessions when the user picks them. */
const DEFAULT_WORTHY: ReadonlySet<PermissionMode> = new Set(['default', 'auto', 'acceptEdits'])

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
  delta?: { type?: string; text?: string; partial_json?: string }
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
  const setClaudeSessionId = useProjectViewsStore((s) => s.setClaudeSessionId)
  const pendingApprovals = useApprovalsStore((s) => s.byPane[paneId] ?? EMPTY_REQUESTS)

  const [processRunning, setProcessRunning] = useState(false)
  const [turnActive, setTurnActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inProgress, setInProgress] = useState<AssistantMessageItem | null>(null)
  const [slashCommands, setSlashCommands] = useState<string[]>([])
  const sessionInit = useSessionInit(paneId)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const itemsLenRef = useRef(0)
  const initialItemsCountRef = useRef(items.length)
  const focusInputRef = useRef<(() => void) | null>(null)
  const paneRef = useRef<HTMLDivElement | null>(null)
  const focusRequest = useFocusRequestStore((s) => (s.request?.paneId === paneId ? s.request.nonce : null))
  const launchedModeRef = useRef<string | undefined>(undefined)
  const launchedBypassRef = useRef<boolean | null>(null)
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

  const note = (text: string): void => appendItems(paneId, [{ kind: 'system', id: crypto.randomUUID(), text }])

  /** False when the running process refused the change; a pane without a process always takes it. */
  const applyFlags = async (settings: Record<string, unknown>): Promise<boolean> => {
    const res = await window.api.claude.control(paneId, 'apply_flag_settings', { settings })
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
    const res = await window.api.claude.control(paneId, 'set_max_thinking_tokens', { max_thinking_tokens: on ? THINKING_BUDGET : 0 })
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
    const res = await window.api.claude.control(paneId, 'set_permission_mode', { mode: next })
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
      setProcessRunning(false)
      setTurnActive(false)
      setInProgress(null)
      appendItems(paneId, [
        { kind: 'system', id: crypto.randomUUID(), text: 'claude process exited' }
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

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const len = items.length + (inProgress ? 1 : 0)
    if (len !== itemsLenRef.current) {
      itemsLenRef.current = len
      el.scrollTop = el.scrollHeight
    }
  }, [items, inProgress])

  const handleStreamEvent = (inner: AnthropicStreamInner) => {
    if (inner.type === 'message_start') {
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
        }
        return { ...prev, content }
      })
      return
    }
    if (inner.type === 'message_stop') {
      // Do nothing — final 'assistant' event will commit the canonical message.
      return
    }
  }

  const handleEvent = (event: ClaudeEvent) => {
    const sessId = (event as { session_id?: string }).session_id
    if (sessId) setClaudeSessionId(paneId, sessId)

    if (event.type === 'stream_event') {
      const se = event as ClaudeStreamEvent
      handleStreamEvent(se.event as AnthropicStreamInner)
      return
    }
    if (event.type === 'system') {
      const sys = event as ClaudeSystemEvent
      if (sys.subtype === 'status' && isPermissionMode(sys.permissionMode)) {
        useProjectViewsStore.getState().setSessionPermissionMode(paneId, sys.permissionMode)
        return
      }
      if (sys.subtype === 'init') {
        if (Array.isArray(sys.slash_commands)) {
          setSlashCommands(sys.slash_commands as string[])
        }
        appendItems(paneId, [
          { kind: 'system', id: crypto.randomUUID(), text: formatInitNote(sys) }
        ])
      }
      return
    }
    if (event.type === 'assistant') {
      const ae = event as ClaudeAssistantEvent
      const item: AssistantMessageItem = {
        kind: 'assistant',
        id: ae.message.id ?? crypto.randomUUID(),
        content: ae.message.content,
        raw: ae
      }
      appendItems(paneId, [item])
      setInProgress(null)
      return
    }
    if (event.type === 'user') {
      const content = (event as { message?: { content?: ContentBlock[] } }).message?.content
      if (!Array.isArray(content)) return
      const notes = content.flatMap((block) => {
        const note = interruptNote(block)
        return note ? [note] : []
      })
      if (notes.length > 0) {
        interruptedRef.current = true
        appendItems(paneId, notes.map((text) => ({ kind: 'system' as const, id: crypto.randomUUID(), text })))
      }
      const results: ToolResultItem[] = content.filter(isToolResultBlock).map((block) => ({
        kind: 'tool_result' as const,
        id: crypto.randomUUID(),
        toolUseId: block.tool_use_id,
        content: block.content,
        isError: block.is_error
      }))
      if (results.length > 0) appendItems(paneId, results)
      return
    }
    if (event.type === 'result') {
      const re = event as ClaudeResultEvent
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
        raw: re
      }
      appendItems(paneId, [item])
      setTurnActive(false)
      setInProgress(null)
      return
    }
  }

  const ensureStarted = async (): Promise<boolean> => {
    if (processRunning) return true
    setError(null)
    launchedModeRef.current = mode
    launchedBypassRef.current = allowBypassSetting
    const { defaults } = useModelStore.getState()
    const flags = launchChoice({ models: choice.models, defaults, selection: model, effort })
    const res = await window.api.claude.start({
      paneId,
      cwd,
      ...flags,
      thinking,
      resumeSessionId,
      permissionMode: mode,
      allowBypass: allowBypassSetting
    })
    if (!res.ok) {
      setError(res.error ?? 'failed to start claude')
      if (resumeSessionId) useProjectViewsStore.getState().clearClaudeSessionId(paneId)
      return false
    }
    setProcessRunning(true)
    return true
  }

  const handleSend = async (text: string, images?: ImageAttachment[]) => {
    const userText =
      text +
      (images && images.length > 0
        ? `\n\n_[${images.length} image${images.length === 1 ? '' : 's'} attached]_`
        : '')
    appendItems(paneId, [
      { kind: 'user', id: crypto.randomUUID(), text: userText } as ChatItem
    ])
    useProjectViewsStore.getState().notePrompt(paneId, text)
    const ok = await ensureStarted()
    if (!ok) return
    setTurnActive(true)
    window.api.claude.send(paneId, text, images)
  }

  const handleInterrupt = () => {
    window.api.claude.interrupt(paneId)
    setTurnActive(false)
    setInProgress(null)
  }

  const handleResume = async () => {
    await ensureStarted()
  }

  const knownSlashCommands =
    slashCommands.length > 0 ? slashCommands : (sessionInit?.commands.map((c) => c.name) ?? [])

  const showIdleBanner =
    items.length > 0 &&
    !processRunning &&
    !turnActive &&
    initialItemsCountRef.current > 0

  return (
    <div ref={paneRef} data-chat-pane className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
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
          <ChatItems items={items} cwd={cwd} streaming={inProgress} />
          {pendingApprovals.map((req) => (
            <ApprovalPrompt key={req.requestId} request={req} autoAvailable={autoAvailable} onSetMode={setMode} />
          ))}
          {turnActive && !inProgress && pendingApprovals.length === 0 && (
            <div className="px-1.5 text-xs text-faint">claude is thinking…</div>
          )}
        </MessageColumn>
      </div>
      <InputBox
        disabled={turnActive}
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        slashCommands={knownSlashCommands}
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
            />
            <Button variant="ghost" pressed={thinking} onClick={() => void toggleThinking()} tooltip="Toggle extended thinking mode">
              <Brain size={13} strokeWidth={2} />
              Thinking
            </Button>
          </>
        }
        footerEnd={
          <PermissionModePicker
            mode={mode}
            modes={modes}
            onSelect={(m) => void pickMode(m)}
            effort={{ level: choice.effort, levels: choice.levels, onSelect: (l) => void pickEffort(l) }}
          />
        }
        onShiftTab={() => void pickMode(nextMode(modes, mode))}
      />
    </div>
  )
}
