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
import { PermissionPrompt } from './PermissionPrompt'
import { useChatItemsStore } from '../../state/chatItemsStore'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { usePermissionsStore } from '../../state/permissionsStore'
import { useFocusRequestStore } from '../../state/sessionNavigation'
import { useSessionInit } from '../../state/sessionInitStore'
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
const EMPTY_REQUESTS: ReturnType<typeof usePermissionsStore.getState>['requestsByPane'][string] =
  []

interface Props {
  paneId: string
  cwd: string
  model?: string
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
  resumeSessionId,
  permissionMode,
  registerFocus
}: Props) {
  const items = useChatItemsStore((s) => s.items[paneId] ?? EMPTY_ITEMS)
  const appendItems = useChatItemsStore((s) => s.appendItems)
  const setClaudeSessionId = useProjectViewsStore((s) => s.setClaudeSessionId)
  const pendingPermissions = usePermissionsStore(
    (s) => s.requestsByPane[paneId] ?? EMPTY_REQUESTS
  )
  const resolvePermission = usePermissionsStore((s) => s.resolveRequest)

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
  const firstPromptRef = useRef<HTMLButtonElement | null>(null)
  const focusRequest = useFocusRequestStore((s) => (s.request?.paneId === paneId ? s.request.nonce : null))

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
      if (firstPromptRef.current) firstPromptRef.current.focus()
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
    const res = await window.api.claude.start({ paneId, cwd, model, resumeSessionId, permissionMode })
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

  const showIdleBanner =
    items.length > 0 &&
    !processRunning &&
    !turnActive &&
    initialItemsCountRef.current > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
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
          {pendingPermissions.map((req, i) => (
            <PermissionPrompt
              key={req.requestId}
              request={req}
              cwd={cwd}
              primaryActionRef={i === 0 ? firstPromptRef : undefined}
              onResolve={() => resolvePermission(req.requestId)}
            />
          ))}
          {turnActive && !inProgress && pendingPermissions.length === 0 && (
            <div className="px-1.5 text-xs text-faint">claude is thinking…</div>
          )}
        </MessageColumn>
      </div>
      <InputBox
        disabled={turnActive}
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        slashCommands={
          slashCommands.length > 0 ? slashCommands : (sessionInit?.commands.map((c) => c.name) ?? [])
        }
        cwd={cwd}
        registerFocus={registerInputFocus}
      />
    </div>
  )
}
