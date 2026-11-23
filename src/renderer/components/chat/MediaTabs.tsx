import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { MEDIA_TAB_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useChatItemsStore } from '../../state/chatItemsStore'
import { mediaKeyOf, shownTab, useChatMediaStore, type ChatMediaKey, type ChatTab } from '../../state/chatMediaStore'
import { useObservedStore } from '../../state/observedStore'
import { TabStrip } from '../ui/TabStrip'
import { collectMedia, type MediaAttachment, type MediaEntry } from './chatMedia'
import { MediaGrid } from './MediaGrid'
import type { ChatItem } from './types'

const NO_ITEMS: ChatItem[] = []
const NO_ATTACHMENTS: MediaAttachment[] = []

interface SessionMedia {
  media: MediaEntry[]
  /** The item count, which grows as the turn streams. */
  revision: number
}

function useHostedMedia(paneId: string, cwd: string): SessionMedia {
  const items = useChatItemsStore((s) => s.items[paneId] ?? NO_ITEMS)
  const attachments = useChatMediaStore((s) => s.attachments[paneId] ?? NO_ATTACHMENTS)
  const media = useMemo(() => collectMedia({ items, cwd, attachments }), [items, cwd, attachments])
  return { media, revision: items.length }
}

function useObservedMedia(cwd: string | undefined): SessionMedia {
  const items = useObservedStore((s) => s.items)
  const media = useMemo(() => collectMedia({ items, cwd }), [items, cwd])
  return { media, revision: items.length }
}

interface TabsProps extends SessionMedia {
  chatKey: ChatMediaKey
  cwd: string | undefined
  children: ReactNode
}

/**
 * The Chat and Media tabs over a transcript. The transcript stays mounted and laid out under the Media
 * tab, only invisible, so its scroll position and scroll-follow carry on.
 */
function ChatTabs({ chatKey, media, revision, cwd, children }: TabsProps) {
  const chosen = useChatMediaStore((s) => s.tab[chatKey])
  const setTab = useChatMediaStore((s) => s.setTab)
  const tab = shownTab(chosen, media.length)
  const regionRef = useRef<HTMLDivElement | null>(null)
  const jumpTo = useRef<string | null>(null)

  const setHasMedia = useChatMediaStore((s) => s.setHasMedia)
  useEffect(() => setHasMedia(chatKey, media.length > 0), [chatKey, media.length, setHasMedia])

  // Focus left in the hidden transcript would let keys scroll it unseen and stop it following.
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (tab === 'media' && transcriptRef.current?.contains(document.activeElement)) gridRef.current?.focus()
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

  const onMedia = tab === 'media'
  return (
    <>
      {media.length > 0 && (
        <TabStrip<ChatTab>
          label="Chat or media"
          value={tab}
          onChange={(t) => setTab(chatKey, t)}
          tabs={[
            { value: 'chat', label: 'Chat', title: `The transcript (${MEDIA_TAB_SHORTCUT})` },
            { value: 'media', label: 'Media', count: media.length, title: `This session's images and videos (${MEDIA_TAB_SHORTCUT})` }
          ]}
        />
      )}
      <div ref={regionRef} className="relative flex min-h-0 flex-1 flex-col">
        <div ref={transcriptRef} className={'flex min-h-0 flex-1 flex-col' + (onMedia ? ' invisible' : '')} aria-hidden={onMedia || undefined}>
          {children}
        </div>
        {onMedia && <MediaGrid ref={gridRef} media={media} cwd={cwd} revision={revision} onJump={jump} />}
      </div>
    </>
  )
}

/** A hosted chat's transcript under its Chat and Media tabs. */
export function HostedMediaTabs({ paneId, cwd, children }: { paneId: string; cwd: string; children: ReactNode }) {
  const { media, revision } = useHostedMedia(paneId, cwd)
  return (
    <ChatTabs chatKey={paneId} media={media} revision={revision} cwd={cwd}>
      {children}
    </ChatTabs>
  )
}

/** The followed VS Code session's transcript under its Chat and Media tabs. */
export function ObservedMediaTabs({ sessionId, cwd, children }: { sessionId: string; cwd: string | undefined; children: ReactNode }) {
  const { media, revision } = useObservedMedia(cwd)
  return (
    <ChatTabs chatKey={mediaKeyOf({ kind: 'observed', sessionId })} media={media} revision={revision} cwd={cwd}>
      {children}
    </ChatTabs>
  )
}
