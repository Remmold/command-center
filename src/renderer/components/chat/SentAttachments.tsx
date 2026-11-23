import { useEffect, useState } from 'react'
import { FileText, Film, ImageOff } from 'lucide-react'
import { useChatMediaStore } from '../../state/chatMediaStore'
import { useSeen } from '../../hooks/useSeen'
import { FileChip } from '../ui/FileChip'
import { ImagePreview } from '../ui/ImagePreview'
import { ImageTile, TileRow } from '../ui/Thumbnail'
import type { TranscriptImageRef, UserAttachment } from './types'
import { previewKey } from './userAttachments'

const TRANSCRIPT_CACHE_SIZE = 16
const transcriptImages = new Map<string, Promise<string | null>>()

/** An attachment and where it sits: the item it belongs to and its place among that item's attachments. */
interface Placed {
  messageId: string
  index: number
  attachment: UserAttachment
}

const transcriptKey = (messageId: string, ref: TranscriptImageRef): string => `${ref.workspaceId}|${ref.sessionId}|${messageId}|${ref.block}`

/** The original from its transcript line; the last few are kept, and a failed read is tried again next time. */
function readTranscriptImage(messageId: string, ref: TranscriptImageRef): Promise<string | null> {
  if (!ref.workspaceId || !ref.sessionId) return Promise.resolve(null)
  const key = transcriptKey(messageId, ref)
  let found = transcriptImages.get(key)
  if (!found) {
    found = window.api.observed.image(ref.workspaceId, ref.sessionId, messageId, ref.block).catch(() => null)
    transcriptImages.set(key, found)
    void found.then((url) => url === null && transcriptImages.delete(key))
    if (transcriptImages.size > TRANSCRIPT_CACHE_SIZE) transcriptImages.delete(transcriptImages.keys().next().value as string)
  }
  return found
}

/** The full image this session sent, the same one the Media tab shows; gone after a restart. */
function useSentImage(key: string): string | null {
  return useChatMediaStore((s) => {
    for (const list of Object.values(s.attachments)) {
      const hit = list.find((a) => a.id === key)
      if (hit?.source.kind === 'data') return hit.source.dataUrl
    }
    return null
  })
}

/**
 * `tile` prefers the small thumbnail; `full` the full image, falling back to the thumbnail. Either reads the original
 * from the transcript when nothing in memory will do, and only once `wanted` (on screen).
 */
function usePicture({ messageId, index, attachment }: Placed, size: 'tile' | 'full', wanted: boolean): string | null {
  const sent = useSentImage(previewKey(messageId, index))
  const ref = attachment.transcript
  const key = ref ? transcriptKey(messageId, ref) : null
  const [read, setRead] = useState<{ key: string; url: string | null } | null>(null)
  const kept = size === 'full' ? sent : (attachment.thumb ?? sent)
  const needsRead = wanted && !kept && ref !== undefined
  useEffect(() => {
    if (!needsRead || !ref || !key) return
    let live = true
    void readTranscriptImage(messageId, ref).then((url) => live && setRead({ key, url }))
    return () => {
      live = false
    }
    // The ref object is rebuilt with each read of the transcript; its key says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRead, messageId, key])
  const fromTranscript = read && read.key === key ? read.url : null
  return kept ?? fromTranscript ?? (size === 'full' ? (attachment.thumb ?? null) : null)
}

function Tile({ placed, onOpen }: { placed: Placed; onOpen: () => void }) {
  const [ref, seen] = useSeen()
  const src = usePicture(placed, 'tile', seen)
  return <ImageTile ref={ref} src={src} alt={placed.attachment.name} onOpen={onOpen} />
}

function VideoPoster({ placed }: { placed: Placed }) {
  const [ref, seen] = useSeen()
  const poster = usePicture(placed, 'tile', seen)
  return (
    <span ref={ref}>
      <FileChip name={placed.attachment.name} meta="Video" thumbnail={poster ?? undefined} icon={<Film size={16} strokeWidth={1.75} />} />
    </span>
  )
}

function Preview({ images, at, onAt }: { images: readonly Placed[]; at: number; onAt: (at: number | null) => void }) {
  const placed = images[at]
  const src = usePicture(placed, 'full', true)
  return (
    <ImagePreview
      name={placed.attachment.name}
      src={src}
      missing={!src && !placed.attachment.transcript}
      onClose={() => onAt(null)}
      onPrevious={at > 0 ? () => onAt(at - 1) : undefined}
      onNext={at < images.length - 1 ? () => onAt(at + 1) : undefined}
    />
  )
}

interface Props {
  messageId: string
  attachments: readonly UserAttachment[]
  notKept: string | null
  belowText: boolean
}

/** A sent prompt's images as thumbnails, with its files and videos as chips; a click opens the preview, stepping through this message's images. */
export function SentAttachments({ messageId, attachments, notKept, belowText }: Props) {
  const [open, setOpen] = useState<number | null>(null)
  const placed = attachments.map((attachment, index): Placed => ({ messageId, index, attachment }))
  const images = placed.filter((p) => p.attachment.kind === 'image')
  const others = placed.filter((p) => p.attachment.kind !== 'image')
  if (attachments.length === 0 && !notKept) return null
  return (
    <div className={`flex flex-col gap-2 whitespace-normal ${belowText ? 'mt-2' : ''}`}>
      {images.length > 0 && (
        <TileRow>
          {images.map((p, at) => (
            <Tile key={p.index} placed={p} onOpen={() => setOpen(at)} />
          ))}
        </TileRow>
      )}
      {(others.length > 0 || notKept) && (
        <TileRow>
          {others.map((p) =>
            p.attachment.kind === 'video' ? (
              <VideoPoster key={p.index} placed={p} />
            ) : (
              <FileChip key={p.index} name={p.attachment.name} meta={p.attachment.kind === 'pdf' ? 'PDF' : 'Text'} icon={<FileText size={16} strokeWidth={1.75} />} />
            )
          )}
          {notKept && <FileChip name={notKept} meta="Sent before attachments were kept" icon={<ImageOff size={16} strokeWidth={1.75} />} />}
        </TileRow>
      )}
      {open !== null && images[open] && <Preview images={images} at={open} onAt={setOpen} />}
    </div>
  )
}
