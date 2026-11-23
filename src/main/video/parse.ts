import type { TranscriptSegment } from '../../shared/videoContext'

export interface ProbeInfo {
  duration: number
  /** As displayed, after any rotation. */
  width: number
  height: number
  hasAudio: boolean
}

interface ProbeStream {
  codec_type?: string
  width?: number
  height?: number
  duration?: string
  tags?: { rotate?: string }
  side_data_list?: { rotation?: number }[]
  disposition?: { attached_pic?: number }
}

/** ffprobe's `-show_streams -show_format -of json`; null when there is no video stream. */
export function parseProbe(json: string): ProbeInfo | null {
  let data: { streams?: ProbeStream[]; format?: { duration?: string } }
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  const streams = data.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  if (!video?.width || !video.height) return null
  const rotation = Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0)
  const turned = Math.abs(rotation) % 180 === 90
  const duration = Number(data.format?.duration ?? video.duration ?? 0)
  return {
    duration: Number.isFinite(duration) ? duration : 0,
    width: turned ? video.height : video.width,
    height: turned ? video.width : video.height,
    hasAudio: streams.some((s) => s.codec_type === 'audio')
  }
}

/** Frame times from the `showinfo` filter's log. */
export function parseSceneTimes(log: string): number[] {
  return [...log.matchAll(/pts_time:\s*(-?[\d.]+)/g)].map((m) => Number(m[1])).filter((t) => Number.isFinite(t) && t >= 0)
}

/** The `volumedetect` filter's loudest peak in dB; null when it printed none. */
export function parseMaxVolume(log: string): number | null {
  const match = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(log)
  if (!match) return null
  return match[1] === '-inf' ? -Infinity : Number(match[1])
}

/** The last `time=` ffmpeg's progress line reported, in seconds. */
export function parseProgressTime(chunk: string): number | null {
  const all = [...chunk.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)]
  const last = all.at(-1)
  return last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : null
}

/** The `whisper` filter's `format=json` output: one object per line, times in milliseconds. */
export function parseWhisperJson(output: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const { start, end, text } = JSON.parse(line) as { start?: unknown; end?: unknown; text?: unknown }
      if (typeof start === 'number' && typeof text === 'string') {
        segments.push({ start: start / 1000, end: typeof end === 'number' ? end / 1000 : start / 1000, text })
      }
    } catch {
      continue
    }
  }
  return segments
}

/** A value inside an ffmpeg filter graph, escaped at both the option and the graph level; backslashes become `/`. */
export function filterValue(value: string): string {
  const option = value.replace(/\\/g, '/').replace(/[\\':]/g, (c) => `\\${c}`)
  return option.replace(/[\\'[\],;]/g, (c) => `\\${c}`)
}

/** Peaks below this are treated as no sound. */
export const SILENT_DB = -45
