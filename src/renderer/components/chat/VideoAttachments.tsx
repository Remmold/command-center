import { type KeyboardEvent } from 'react'
import { Film } from 'lucide-react'
import { FFMPEG_INSTALL_COMMAND, SPEECH_MODEL } from '../../../shared/video'
import { formatClock } from '../../../shared/videoContext'
import { useSpeechModelStore } from '../../state/speechModelStore'
import { Button } from '../ui/Button'
import { ChoiceButton, ChoiceList, ChoicePrompt, PromptCode, PromptNote } from '../ui/ChoicePrompt'
import { FileChip, FileChipDetails, ImageStrip } from '../ui/FileChip'
import { NoticeLine } from '../ui/NoticeLine'
import { ProgressBar } from '../ui/ProgressBar'
import { videoMeta, type PendingVideo } from './useVideoAttachments'

const FFMPEG_HELP = 'https://ffmpeg.org/download.html#build-windows'
const EXCERPT_LINES = 8

const sheetUrl = (base64: string): string => `data:image/jpeg;base64,${base64}`

interface ChipProps {
  video: PendingVideo
  expanded: boolean
  onToggle: () => void
  onRemove: () => void
}

export function VideoChip({ video, expanded, onToggle, onRemove }: ChipProps) {
  const sheet = video.frames?.sheets[0]
  const canExpand = video.phase === 'ready' || video.phase === 'no-ffmpeg'
  return (
    <FileChip
      name={video.name}
      meta={videoMeta(video)}
      thumbnail={sheet ? sheetUrl(sheet.base64) : undefined}
      icon={<Film size={16} strokeWidth={1.75} />}
      tone={video.phase === 'failed' || video.phase === 'no-ffmpeg' ? 'error' : 'normal'}
      onToggle={canExpand ? onToggle : undefined}
      expanded={canExpand ? expanded : undefined}
      onRemove={onRemove}
    />
  )
}

/** An expanded video chip: its sheets, the start of the text Claude gets, and the cost; or how to get ffmpeg. */
export function VideoDetails({ video }: { video: PendingVideo }) {
  if (video.phase === 'no-ffmpeg') {
    return (
      <FileChipDetails label={`${video.name} details`}>
        <PromptNote>
          Videos are read with ffmpeg, which is not installed. Install it from a terminal, then attach the video again (
          <a href={FFMPEG_HELP} target="_blank" rel="noreferrer" className="text-link hover:underline">
            how to install ffmpeg
          </a>
          ):
        </PromptNote>
        <PromptCode>{FFMPEG_INSTALL_COMMAND}</PromptCode>
      </FileChipDetails>
    )
  }
  if (!video.frames || !video.text) return null
  const lines = video.text.split('\n')
  const excerpt = lines.slice(0, EXCERPT_LINES).join('\n') + (lines.length > EXCERPT_LINES ? `\n… ${lines.length - EXCERPT_LINES} more lines` : '')
  const { sheets, frameTimes } = video.frames
  return (
    <FileChipDetails label={`${video.name} details`}>
      <ImageStrip
        images={sheets.map((s, i) => ({
          src: sheetUrl(s.base64),
          alt: `Sheet ${i + 1}: ${frameTimes.slice(s.first, s.first + s.count).map(formatClock).join(', ')}`
        }))}
      />
      <PromptCode>{excerpt}</PromptCode>
      <PromptNote>
        About {video.tokens?.toLocaleString('en-US')} tokens: {sheets.length} {sheets.length === 1 ? 'image' : 'images'} and the text above.
      </PromptNote>
    </FileChipDetails>
  )
}

/** The once-only question for the speech model, then its download. */
export function SpeechModelPrompt({ onAnswer }: { onAnswer: (download: boolean) => void }) {
  const status = useSpeechModelStore((s) => s.status)
  const cancel = useSpeechModelStore((s) => s.cancel)
  const download = useSpeechModelStore((s) => s.download)

  if (status?.state === 'downloading') {
    const pct = Math.floor((status.received / status.total) * 100)
    return (
      <NoticeLine
        action={
          <>
            <ProgressBar value={status.received} max={status.total} label="Speech model download" caption={`${pct}%`} />
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
          </>
        }
      >
        Downloading the speech model ({SPEECH_MODEL.label})…
      </NoticeLine>
    )
  }
  if (status?.state === 'failed') {
    return (
      <NoticeLine
        tone="warning"
        action={
          <>
            <Button variant="secondary" onClick={download}>
              Retry
            </Button>
            <Button variant="secondary" onClick={() => onAnswer(false)}>
              Frames only
            </Button>
          </>
        }
      >
        Could not download the speech model: {status.error}
      </NoticeLine>
    )
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== '1' && e.key !== '2') return
    e.preventDefault()
    onAnswer(e.key === '1')
  }
  return (
    <ChoicePrompt label="Speech model" title="Download the speech model (whisper small, 470 MB) to transcribe videos? It runs on this computer." onKeyDown={onKeyDown}>
      <ChoiceList>
        <ChoiceButton shortcut="1" primary onClick={() => onAnswer(true)}>
          Download
        </ChoiceButton>
        <ChoiceButton shortcut="2" onClick={() => onAnswer(false)}>
          Frames only
        </ChoiceButton>
      </ChoiceList>
    </ChoicePrompt>
  )
}
