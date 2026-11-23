import { useCallback, useEffect, useRef, useState } from 'react'
import type { VideoFrames, VideoSource, VideoStage, VideoTranscriptResult } from '../../../shared/video'
import { estimateTokens, formatClock, videoContextText, type Speech } from '../../../shared/videoContext'
import { useGeneralSettingsStore } from '../../state/generalSettingsStore'
import { useSpeechModelStore } from '../../state/speechModelStore'
import type { VideoAttachment } from './attachments'

/** `asking` waits on the speech model: the question, or its download. */
export type VideoPhase = 'preparing' | 'asking' | 'transcribing' | 'ready' | 'no-ffmpeg' | 'failed'

export interface PendingVideo {
  id: string
  name: string
  phase: VideoPhase
  stage: VideoStage
  /** 0–1 within the stage. */
  fraction: number
  duration?: number
  frames?: VideoFrames
  error?: string
  /** Why there is no transcript, shown on the chip when it is not obvious. */
  framesOnly?: string
  text?: string
  tokens?: number
}

const STAGE_SPAN: Record<VideoStage, [number, number]> = {
  reading: [0, 0.02],
  scenes: [0.02, 0.5],
  frames: [0.5, 0.95],
  sheets: [0.95, 1],
  transcribing: [0, 1]
}

const percent = (v: PendingVideo): string => {
  const [from, to] = STAGE_SPAN[v.stage]
  return `${Math.round((from + (to - from) * v.fraction) * 100)}%`
}

const tokenLabel = (n: number): string => (n < 1000 ? `≈${n} tokens` : `≈${(n / 1000).toFixed(1)}k tokens`)

/** The chip's second line. */
export function videoMeta(v: PendingVideo): string {
  const length = v.duration !== undefined ? `${formatClock(v.duration)} · ` : ''
  switch (v.phase) {
    case 'preparing':
      return `${length}preparing… ${percent(v)}`
    case 'asking':
      return `${length}waiting for the speech model`
    case 'transcribing':
      return `${length}transcribing… ${percent(v)}`
    case 'ready':
      return `${length}${v.frames?.frameTimes.length ?? 0} frames · ${tokenLabel(v.tokens ?? 0)}${v.framesOnly ? ` · ${v.framesOnly}` : ''}`
    case 'no-ffmpeg':
      return 'Video needs ffmpeg'
    case 'failed':
      return v.error ?? 'Could not read this video'
  }
}

/** Why a prepared video gets no transcript, or null when it should be transcribed. */
function noSpeechReason(frames: VideoFrames): string | null {
  if (!frames.hasAudio) return 'the video has no audio'
  if (!frames.audible) return 'the audio is near silent'
  if (!frames.canTranscribe) return 'this ffmpeg has no whisper filter'
  return null
}

function finished(v: PendingVideo, speech: Speech): PendingVideo {
  if (!v.frames) return v
  const { frames } = v
  const text = videoContextText({ name: v.name, duration: frames.duration, frameTimes: frames.frameTimes, sheets: frames.sheets, speech })
  return { ...v, phase: 'ready', text, tokens: estimateTokens(frames.sheets, text) }
}

async function sourceOf(file: File): Promise<VideoSource> {
  const path = window.api.video.pathOf(file)
  return path ? { path, name: file.name } : { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name }
}

/** Videos attached to a prompt: each is prepared in the main process, then waits for sending. */
export function useVideoAttachments() {
  const [videos, setVideos] = useState<PendingVideo[]>([])
  const live = useRef(new Set<string>())
  const transcription = useGeneralSettingsStore((s) => s.videoTranscription)
  const setTranscription = useGeneralSettingsStore((s) => s.setVideoTranscription)
  const model = useSpeechModelStore((s) => s.status)

  const update = useCallback((id: string, change: (v: PendingVideo) => PendingVideo) => {
    setVideos((all) => all.map((v) => (v.id === id ? change(v) : v)))
  }, [])

  useEffect(
    () =>
      window.api.video.onProgress(({ jobId, stage, fraction, duration }) => {
        if (!live.current.has(jobId)) return
        update(jobId, (v) => ({ ...v, stage, fraction, duration: duration ?? v.duration }))
      }),
    [update]
  )

  useEffect(() => {
    const ids = live.current
    return () => {
      for (const id of ids) void window.api.video.release(id)
      ids.clear()
    }
  }, [])

  const transcribe = useCallback(
    (id: string) => {
      update(id, (v) => ({ ...v, phase: 'transcribing', stage: 'transcribing', fraction: 0 }))
      const failed = (v: PendingVideo) => ({ ...finished(v, { kind: 'none', reason: 'transcription failed' }), framesOnly: 'transcription failed' })
      const settle = (result: VideoTranscriptResult) => {
        if (!live.current.has(id)) return
        if (result.ok) {
          update(id, (v) =>
            finished(v, result.segments.length > 0 ? { kind: 'transcript', segments: result.segments } : { kind: 'none', reason: 'no speech was heard' })
          )
        } else if (result.reason !== 'cancelled') {
          update(id, failed)
        }
      }
      void window.api.video.transcribe(id).then(settle, () => settle({ ok: false, reason: 'failed' }))
    },
    [update]
  )

  // The model question's answer, or a finished download, settles every video waiting on it.
  const waiting = videos.filter((v) => v.phase === 'asking').map((v) => v.id)
  const waitingKey = waiting.join(',')
  useEffect(() => {
    if (waiting.length === 0) return
    if (transcription === 'off') {
      for (const id of waiting) update(id, (v) => finished(v, { kind: 'none', reason: 'transcription is off' }))
    } else if (model?.state === 'ready') {
      for (const id of waiting) transcribe(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingKey, transcription, model?.state, transcribe, update])

  const settleSpeech = (id: string, frames: VideoFrames) => {
    const reason = noSpeechReason(frames)
    const settings = useGeneralSettingsStore.getState().videoTranscription
    if (reason) {
      const note = frames.canTranscribe ? undefined : 'frames only: no whisper in this ffmpeg'
      update(id, (v) => ({ ...finished(v, { kind: 'none', reason }), framesOnly: note }))
    } else if (settings === 'off') {
      update(id, (v) => finished(v, { kind: 'none', reason: 'transcription is off' }))
    } else if (useSpeechModelStore.getState().status?.state === 'ready') {
      transcribe(id)
    } else {
      update(id, (v) => ({ ...v, phase: 'asking' }))
    }
  }

  const add = async (files: readonly File[]) => {
    for (const file of files) {
      const id = crypto.randomUUID()
      live.current.add(id)
      setVideos((all) => [...all, { id, name: file.name, phase: 'preparing', stage: 'reading', fraction: 0 }])
      void sourceOf(file)
        .then((source) => window.api.video.prepare(id, source))
        .then((result) => {
          if (!live.current.has(id)) return
          if (result.ok) {
            const { ok: _ok, ...frames } = result
            update(id, (v) => ({ ...v, frames, duration: frames.duration }))
            settleSpeech(id, frames)
          } else if (result.reason === 'no-ffmpeg') {
            update(id, (v) => ({ ...v, phase: 'no-ffmpeg' }))
          } else if (result.reason === 'failed') {
            update(id, (v) => ({ ...v, phase: 'failed', error: result.error }))
          }
        })
        .catch((err: unknown) => update(id, (v) => ({ ...v, phase: 'failed', error: String(err) })))
    }
  }

  const remove = (id: string) => {
    live.current.delete(id)
    void window.api.video.release(id)
    setVideos((all) => all.filter((v) => v.id !== id))
  }

  /** The ready videos as prompt attachments; their temp folders go now that the sheets are in memory. */
  const take = (): VideoAttachment[] => {
    const taken = videos.flatMap((v): VideoAttachment[] =>
      v.phase === 'ready' && v.frames && v.text
        ? [{ kind: 'video', name: v.name, sheets: v.frames.sheets, text: v.text, sourcePath: v.frames.sourcePath }]
        : []
    )
    for (const v of videos) remove(v.id)
    return taken
  }

  /** The model question: download it (and transcribe from then on), or send frames only from now on. */
  const answer = (download: boolean) => {
    setTranscription(download ? 'on' : 'off')
    if (download) useSpeechModelStore.getState().download()
  }

  const blocked = videos.some((v) => v.phase === 'failed' || v.phase === 'no-ffmpeg')
  return { videos, add, remove, take, answer, allReady: videos.every((v) => v.phase === 'ready'), blocked }
}
