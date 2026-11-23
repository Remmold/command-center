import { memo, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Copy, ExternalLink, FileQuestion, FolderOpen, MessageSquareText } from 'lucide-react'
import type { MediaFile } from '../../../shared/media'
import { useMenu } from '../../hooks/useMenu'
import { MEDIA_PANEL_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useChatMediaStore, type ChatMediaKey } from '../../state/chatMediaStore'
import { useToastStore } from '../../state/toastStore'
import { IconButton } from '../ui/IconButton'
import { ImagePreview } from '../ui/ImagePreview'
import { MenuItem } from '../ui/MenuItem'
import { Popover, PopoverMenu } from '../ui/Popover'
import { SidePanel } from '../ui/SidePanel'
import { Thumbnail, ThumbnailImage, ThumbnailPlaceholder, ThumbnailVideo } from '../ui/Thumbnail'
import { TimeStamp } from '../ui/TimeStamp'
import type { MediaEntry } from './chatMedia'
import { stampLabel, stampTitle } from './messageTime'

type Loaded = { state: 'pending' } | { state: 'missing' } | { state: 'found'; url: string; path: string | null }

const PENDING: Loaded = { state: 'pending' }

// Keyed by the mention's time too, so a file written again after it was first shown is looked up afresh.
const lookups = new Map<string, Promise<MediaFile>>()

const lookupKey = (entry: MediaEntry, cwd: string | undefined): string => `${cwd ?? ''}|${entry.key}|${entry.at ?? ''}`

function lookUp(entry: MediaEntry, cwd: string | undefined): Promise<Loaded> {
  if (entry.source.kind === 'data') return Promise.resolve({ state: 'found', url: entry.source.dataUrl, path: null })
  const path = entry.source.path
  const key = lookupKey(entry, cwd)
  let lookup = lookups.get(key)
  if (!lookup) {
    lookup = window.api.files.resolveMedia(cwd ?? '', [path]).then((files) => files[0] ?? { found: false })
    lookups.set(key, lookup)
  }
  return lookup.then((file) => (file.found ? { state: 'found', url: file.url, path: file.path } : { state: 'missing' }))
}

function useLoaded(entry: MediaEntry, cwd: string | undefined, active: boolean): Loaded {
  const key = lookupKey(entry, cwd)
  const entryRef = useRef(entry)
  entryRef.current = entry
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded }>({ key: '', value: PENDING })
  useEffect(() => {
    if (!active) return
    let live = true
    void lookUp(entryRef.current, cwd).then((value) => live && setLoaded({ key, value }))
    return () => {
      live = false
    }
  }, [key, cwd, active])
  return loaded.key === key ? loaded.value : PENDING
}

const sameTile = (a: TileProps, b: TileProps): boolean =>
  a.entry.key === b.entry.key &&
  a.entry.at === b.entry.at &&
  a.entry.messageId === b.entry.messageId &&
  a.cwd === b.cwd &&
  a.onOpen === b.onOpen &&
  a.onJump === b.onJump

/** True once the element has scrolled into view; it stays loaded after. */
function useSeen(): [(el: HTMLElement | null) => void, boolean] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!el || seen) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, seen])
  return [setEl, seen]
}

async function openExternally(path: string): Promise<void> {
  const error = await window.api.files.openWithSystem(path)
  if (error) useToastStore.getState().show(`Could not open ${path}: ${error}`)
}

interface TileProps {
  entry: MediaEntry
  cwd: string | undefined
  onOpen: (entry: MediaEntry) => void
  onJump: (messageId: string) => void
}

const MediaTile = memo(function MediaTile({ entry, cwd, onOpen, onJump }: TileProps) {
  const [ref, seen] = useSeen()
  const loaded = useLoaded(entry, cwd, seen)
  const menu = useMenu()
  const filePath = entry.source.kind === 'file' ? entry.source.path : null
  const foundPath = loaded.state === 'found' ? loaded.path : null

  const setRefs = (el: HTMLDivElement | null) => {
    ref(el)
    menu.setAnchor(el)
  }
  const onContextMenu = (e: MouseEvent) => {
    if (!filePath) return
    e.preventDefault()
    menu.show()
  }
  const act = (fn: () => void) => () => {
    menu.close()
    fn()
  }

  const picture =
    loaded.state === 'missing' ? (
      <ThumbnailPlaceholder icon={<FileQuestion size={20} />}>File not found</ThumbnailPlaceholder>
    ) : loaded.state === 'pending' ? null : entry.kind === 'video' ? (
      <ThumbnailVideo src={loaded.url} />
    ) : (
      <ThumbnailImage src={loaded.url} alt={entry.name} />
    )

  return (
    <>
      <Thumbnail
        ref={setRefs}
        caption={entry.name}
        title={filePath ?? entry.name}
        detail={entry.at !== undefined && <TimeStamp at={entry.at} label={stampLabel(entry.at)} title={stampTitle(entry.at)} />}
        onOpen={() => onOpen(entry)}
        onContextMenu={onContextMenu}
        actionsPinned={menu.open}
        actions={
          <>
            <IconButton onClick={() => onJump(entry.messageId)} label="Jump to message">
              <MessageSquareText size={14} />
            </IconButton>
            {foundPath && (
              <IconButton onClick={() => void openExternally(foundPath)} label="Open externally">
                <ExternalLink size={14} />
              </IconButton>
            )}
          </>
        }
      >
        {picture}
      </Thumbnail>
      {filePath && (
        <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} label="Media actions">
          <PopoverMenu label="Media actions">
            <MenuItem icon={Copy} label="Copy path" onClick={act(() => void navigator.clipboard.writeText(foundPath ?? filePath))} />
            <MenuItem icon={FolderOpen} label="Reveal in Explorer" disabled={!foundPath} onClick={act(() => foundPath && void window.api.files.revealMedia(foundPath))} />
          </PopoverMenu>
        </Popover>
      )}
    </>
  )
}, sameTile)

function MediaViewer({ media, index, cwd, onIndex, onClose }: { media: readonly MediaEntry[]; index: number; cwd: string | undefined; onIndex: (i: number) => void; onClose: () => void }) {
  const entry = media[index]
  const loaded = useLoaded(entry, cwd, true)
  const path = loaded.state === 'found' ? loaded.path : null
  return (
    <ImagePreview
      name={entry.name}
      src={loaded.state === 'found' ? loaded.url : null}
      video={entry.kind === 'video'}
      missing={loaded.state === 'missing'}
      onClose={onClose}
      onOpenExternally={path ? () => void openExternally(path) : undefined}
      onPrevious={index > 0 ? () => onIndex(index - 1) : undefined}
      onNext={index < media.length - 1 ? () => onIndex(index + 1) : undefined}
    />
  )
}

interface Props {
  chatKey: ChatMediaKey
  media: readonly MediaEntry[]
  cwd: string | undefined
  onJump: (messageId: string) => void
}

/** Every image and video the chat touched, newest first; a click opens the preview, which steps through them. */
export function MediaPanel({ chatKey, media, cwd, onJump }: Props) {
  const width = useChatMediaStore((s) => s.width)
  const setWidth = useChatMediaStore((s) => s.setWidth)
  const toggle = useChatMediaStore((s) => s.toggle)
  const [viewing, setViewing] = useState<string | null>(null)
  const index = viewing === null ? -1 : media.findIndex((m) => m.key === viewing)
  const onOpen = useRef((entry: MediaEntry) => setViewing(entry.key)).current

  return (
    <SidePanel title="Media" width={width} onResize={setWidth} onClose={() => toggle(chatKey)} closeTooltip={`Close Media (${MEDIA_PANEL_SHORTCUT})`}>
      {media.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted">Images and videos this chat reads, writes or names show here.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2" data-media-grid="">
          {media.map((entry) => (
            <MediaTile key={entry.key} entry={entry} cwd={cwd} onOpen={onOpen} onJump={onJump} />
          ))}
        </div>
      )}
      {index !== -1 && (
        <MediaViewer media={media} index={index} cwd={cwd} onIndex={(i) => setViewing(media[i].key)} onClose={() => setViewing(null)} />
      )}
    </SidePanel>
  )
}
