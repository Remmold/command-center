import type { TranscriptSegment } from './videoContext'

/** Attached files that are prepared as video: frames and a transcript. GIF counts as video. */
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'gif'] as const

/** By extension, as `video/mp2t` is also what browsers call a TypeScript file; the type only for a name without one. */
export function isVideoFile(name: string, mediaType: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return /^video\//.test(mediaType)
  return (VIDEO_EXTENSIONS as readonly string[]).includes(name.slice(dot + 1).toLowerCase())
}

export type VideoStage = 'reading' | 'scenes' | 'frames' | 'sheets' | 'transcribing'

export interface VideoProgressEvent {
  jobId: string
  stage: VideoStage
  /** 0–1 within the stage. */
  fraction: number
  /** Known once the video has been probed. */
  duration?: number
}

/** A file on disk is read where it is; a pasted one without a path is written into the job's temp folder. */
export type VideoSource = { path: string; name: string } | { bytes: Uint8Array; name: string }

export interface VideoSheetImage {
  base64: string
  width: number
  height: number
  first: number
  count: number
}

export interface VideoFrames {
  duration: number
  width: number
  height: number
  hasAudio: boolean
  /** Has audio that is not near silent. */
  audible: boolean
  frameTimes: number[]
  sheets: VideoSheetImage[]
  /** The original, for the Media tab; null when it was pasted without a path. */
  sourcePath: string | null
  /** This ffmpeg has the `whisper` filter. */
  canTranscribe: boolean
}

export type VideoFramesResult =
  | ({ ok: true } & VideoFrames)
  | { ok: false; reason: 'no-ffmpeg' | 'failed' | 'cancelled'; error?: string }

export type VideoTranscriptResult = { ok: true; segments: TranscriptSegment[] } | { ok: false; reason: 'no-model' | 'failed' | 'cancelled'; error?: string }

export interface SpeechModel {
  label: string
  file: string
  url: string
  bytes: number
  sha256: string
}

/** whisper.cpp's multilingual small model, from its official Hugging Face repository. */
export const SPEECH_MODEL: SpeechModel = {
  label: 'whisper small',
  file: 'ggml-small.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  bytes: 487_601_967,
  sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b'
}

export type SpeechModelStatus =
  | { state: 'absent' }
  | { state: 'downloading'; received: number; total: number }
  | { state: 'failed'; error: string; received: number; total: number }
  | { state: 'ready'; bytes: number }

/** Whether a video's speech is transcribed: asked once on the first video with sound, then remembered. */
export type VideoTranscription = 'ask' | 'on' | 'off'

export const FFMPEG_INSTALL_COMMAND = 'winget install Gyan.FFmpeg'
