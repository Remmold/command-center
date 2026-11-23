import { forwardRef, memo, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Copy, ExternalLink, FileQuestion, FolderOpen, MessageSquareText } from 'lucide-react'
import type { MediaFile } from '../../../shared/media'
import { useMenu } from '../../hooks/useMenu'
import { useToastStore } from '../../state/toastStore'
import { IconButton } from '../ui/IconButton'
import { ImagePreview } from '../ui/ImagePreview'
import { useSeen } from '../../hooks/useSeen'
import { MenuItem } from '../ui/MenuItem'
import { Popover, PopoverMenu } from '../ui/Popover'
import { Thumbnail, ThumbnailGrid, ThumbnailImage, ThumbnailPlaceholder, ThumbnailVideo } from '../ui/Thumbnail'
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
    lookup = window.api.files.resolveMedia(cwd ?? '', [path]).then((files) => {
      const file = files[0] ?? { found: false }
      // A file named before it is written is looked up again on the chat's next item.
      if (!file.found) lookups.delete(key)
      return file
    })
    lookups.set(key, lookup)
  }
  return lookup.then((file) => (file.found ? { state: 'found', url: file.url, path: file.path } : { state: 'missing' }))
}

function useLoaded(entry: MediaEntry, cwd: string | undefined, active: boolean, revision: number): Loaded {
  const key = lookupKey(entry, cwd)
  const entryRef = useRef(entry)
  entryRef.current = entry
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded }>({ key: '', value: PENDING })
  const retry = loaded.key === key && loaded.value.state === 'missing' ? revision : 0
  useEffect(() => {
    if (!active) return
    let live = true
    void lookUp(entryRef.current, cwd).then((value) => live && setLoaded({ key, value }))
    return () => {
      live = false
    }
  }, [key, cwd, active, retry])
  return loaded.key === key ? loaded.value : PENDING
}

const sameTile = (a: TileProps, b: TileProps): boolean =>
  a.entry.key === b.entry.key &&
  a.entry.at === b.entry.at &&
  a.entry.messageId === b.entry.messageId &&
  a.cwd === b.cwd &&
  a.revision === b.revision &&
  a.onOpen === b.onOpen &&
  a.onJump === b.onJump

async function openExternally(path: string): Promise<void> {
  const error = await window.api.files.openWithSystem(path)
  if (error) useToastStore.getState().show(`Could not open ${path}: ${error}`)
}

interface TileProps {
  entry: MediaEntry
  cwd: string | undefined
  /** Changes with every new item, so a missing file is looked for again. */
  revision: number
  onOpen: (entry: MediaEntry) => void
  onJump: (messageId: string) => void
}

const MediaTile = memo(function MediaTile({ entry, cwd, revision, onOpen, onJump }: TileProps) {
  const [ref, seen] = useSeen()
  const loaded = useLoaded(entry, cwd, seen, revision)
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

interface ViewerProps {
  media: readonly MediaEntry[]
  index: number
  cwd: string | undefined
  revision: number
  onIndex: (i: number) => void
  onClose: () => void
}

function MediaViewer({ media, index, cwd, revision, onIndex, onClose }: ViewerProps) {
  const entry = media[index]
  const loaded = useLoaded(entry, cwd, true, revision)
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
  media: readonly MediaEntry[]
  cwd: string | undefined
  revision: number
  onJump: (messageId: string) => void
}

/** Every image and video the chat touched, newest first, filling the transcript's space; a click opens the preview, which steps through them. */
export const MediaGrid = forwardRef<HTMLDivElement, Props>(function MediaGrid({ media, cwd, revision, onJump }, ref) {
  const [viewing, setViewing] = useState<string | null>(null)
  const index = viewing === null ? -1 : media.findIndex((m) => m.key === viewing)
  const onOpen = useRef((entry: MediaEntry) => setViewing(entry.key)).current

  return (
    <div ref={ref} role="tabpanel" aria-label="Media" tabIndex={-1} className="absolute inset-0 overflow-y-auto px-5 py-4 focus:outline-none">
      <ThumbnailGrid>
        {media.map((entry) => (
          <MediaTile key={entry.key} entry={entry} cwd={cwd} revision={revision} onOpen={onOpen} onJump={onJump} />
        ))}
      </ThumbnailGrid>
      {index !== -1 && (
        <MediaViewer media={media} index={index} cwd={cwd} revision={revision} onIndex={(i) => setViewing(media[i].key)} onClose={() => setViewing(null)} />
      )}
    </div>
  )
})
