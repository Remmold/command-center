import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import { Image } from 'lucide-react'
import { MEDIA_PANEL_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useChatItemsStore } from '../../state/chatItemsStore'
import { observedMediaKey, useChatMediaStore, type ChatMediaKey } from '../../state/chatMediaStore'
import { useObservedStore } from '../../state/observedStore'
import { Button } from '../ui/Button'
import { collectMedia, type MediaAttachment, type MediaEntry } from './chatMedia'
import { MediaPanel } from './MediaPanel'
import type { ChatItem } from './types'

const NO_ITEMS: ChatItem[] = []
const NO_ATTACHMENTS: MediaAttachment[] = []

/** Which chat a Media button or panel belongs to: a hosted pane, or the VS Code session being followed. */
export type MediaChat = { kind: 'hosted'; paneId: string; cwd: string } | { kind: 'observed'; sessionId: string; cwd: string | undefined }

const keyOf = (chat: MediaChat): ChatMediaKey => (chat.kind === 'hosted' ? chat.paneId : observedMediaKey(chat.sessionId))

function useHostedMedia(paneId: string, cwd: string): MediaEntry[] {
  const items = useChatItemsStore((s) => s.items[paneId] ?? NO_ITEMS)
  const attachments = useChatMediaStore((s) => s.attachments[paneId] ?? NO_ATTACHMENTS)
  return useMemo(() => collectMedia({ items, cwd, attachments }), [items, cwd, attachments])
}

function useObservedMedia(cwd: string | undefined): MediaEntry[] {
  const items = useObservedStore((s) => s.items)
  return useMemo(() => collectMedia({ items, cwd }), [items, cwd])
}

function MediaToggle({ chatKey, count }: { chatKey: ChatMediaKey; count: number }) {
  const open = useChatMediaStore((s) => s.open[chatKey] === true)
  const toggle = useChatMediaStore((s) => s.toggle)
  return (
    <Button variant="ghost" pressed={open} onClick={() => toggle(chatKey)} label="Media" tooltip={`${open ? 'Hide' : 'Show'} this chat's images and videos (${MEDIA_PANEL_SHORTCUT})`}>
      <Image size={14} strokeWidth={2} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </Button>
  )
}

function HostedToggle({ paneId, cwd }: { paneId: string; cwd: string }) {
  return <MediaToggle chatKey={paneId} count={useHostedMedia(paneId, cwd).length} />
}

function ObservedToggle({ sessionId, cwd }: { sessionId: string; cwd: string | undefined }) {
  return <MediaToggle chatKey={observedMediaKey(sessionId)} count={useObservedMedia(cwd).length} />
}

/** The chat header's Media button: an image icon with the count of media the chat touched. */
export function MediaButton({ chat }: { chat: MediaChat }) {
  return chat.kind === 'hosted' ? <HostedToggle paneId={chat.paneId} cwd={chat.cwd} /> : <ObservedToggle sessionId={chat.sessionId} cwd={chat.cwd} />
}

function HostedPanel({ paneId, cwd, onJump }: { paneId: string; cwd: string; onJump: (id: string) => void }) {
  return <MediaPanel chatKey={paneId} media={useHostedMedia(paneId, cwd)} cwd={cwd} onJump={onJump} />
}

function ObservedPanel({ sessionId, cwd, onJump }: { sessionId: string; cwd: string | undefined; onJump: (id: string) => void }) {
  return <MediaPanel chatKey={observedMediaKey(sessionId)} media={useObservedMedia(cwd)} cwd={cwd} onJump={onJump} />
}

/** A chat with its Media panel on the right; the chat stays mounted, and only the panel follows new media. */
export function MediaSplit({ chat, children }: { chat: MediaChat; children: ReactNode }) {
  const open = useChatMediaStore((s) => s.open[keyOf(chat)] === true)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const jump = useCallback((messageId: string) => {
    const row = rootRef.current?.querySelector(`[data-item-id="${CSS.escape(messageId)}"]`)
    row?.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <div ref={rootRef} className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">{children}</div>
      {open &&
        (chat.kind === 'hosted' ? (
          <HostedPanel paneId={chat.paneId} cwd={chat.cwd} onJump={jump} />
        ) : (
          <ObservedPanel sessionId={chat.sessionId} cwd={chat.cwd} onJump={jump} />
        ))}
    </div>
  )
}
