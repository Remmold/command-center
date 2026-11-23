import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { formatClock, layoutSheets, MAX_FRAME_SIDE, planFrames, SHEET_PADDING, type TranscriptSegment } from '../../shared/videoContext'
import type { VideoStage } from '../../shared/video'
import { run, type FfmpegTools } from './ffmpeg'
import { filterValue, parseMaxVolume, parseProbe, parseProgressTime, parseSceneTimes, parseWhisperJson, SILENT_DB, type ProbeInfo } from './parse'

/** A cut scores above this in ffmpeg's scene detection. */
const SCENE_THRESHOLD = 0.3
const FRAME_JOBS = 4

export type Progress = (stage: VideoStage, fraction: number, duration?: number) => void

export interface PreparedSheet {
  path: string
  width: number
  height: number
  first: number
  count: number
}

export interface PreparedFrames extends ProbeInfo {
  /** There is an audio stream and it is not near silent. */
  audible: boolean
  frameTimes: number[]
  sheets: PreparedSheet[]
}

interface JobBase {
  source: string
  /** Empty folder this job writes to; never the source's own folder. */
  workDir: string
  tools: FfmpegTools
  onProgress?: Progress
  signal?: AbortSignal
}

const QUIET = ['-hide_banner', '-nostdin', '-y']

export class VideoError extends Error {}

const lastLine = (log: string): string => log.trim().split(/\r?\n/).at(-1) ?? ''

function fontFile(env: NodeJS.ProcessEnv = process.env): string | null {
  if (process.platform !== 'win32') return null
  const fonts = join(env.WINDIR ?? 'C:\\Windows', 'Fonts')
  return ['segoeuib.ttf', 'arialbd.ttf', 'arial.ttf'].map((f) => join(fonts, f)).find((f) => existsSync(f)) ?? null
}

async function probe(tools: FfmpegTools, source: string, signal?: AbortSignal): Promise<ProbeInfo> {
  const result = await run(tools.ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', source], { signal })
  const info = result.code === 0 ? parseProbe(result.stdout) : null
  if (!info) throw new VideoError('Could not read this video')
  return info
}

function progressOf(duration: number, report: (fraction: number) => void): (chunk: string) => void {
  return (chunk) => {
    const time = parseProgressTime(chunk)
    if (time !== null && duration > 0) report(Math.min(1, time / duration))
  }
}

async function sceneTimes(job: JobBase, duration: number): Promise<number[]> {
  const filter = `scale=160:-2,select='gt(scene,${SCENE_THRESHOLD})',showinfo`
  const result = await run(job.tools.ffmpeg, [...QUIET, '-i', job.source, '-an', '-sn', '-dn', '-vf', filter, '-f', 'null', '-'], {
    signal: job.signal,
    onStderr: progressOf(duration, (f) => job.onProgress?.('scenes', f))
  })
  return result.code === 0 ? parseSceneTimes(result.stderr) : []
}

async function audible(job: JobBase): Promise<boolean> {
  const result = await run(job.tools.ffmpeg, [...QUIET, '-i', job.source, '-vn', '-sn', '-af', 'volumedetect', '-f', 'null', '-'], { signal: job.signal })
  const peak = parseMaxVolume(result.stderr)
  return peak !== null && peak > SILENT_DB
}

function frameFilter(width: number, height: number, time: number, font: string | null): string {
  const fit = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
  if (!font) return fit
  const size = Math.max(12, Math.round(Math.min(width, height) / 12))
  const label = filterValue(formatClock(time))
  return `${fit},drawtext=fontfile=${filterValue(font)}:text=${label}:fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=${Math.round(size / 4)}:x=${Math.round(size / 3)}:y=h-th-${Math.round(size / 2)}`
}

async function grabFrame(job: JobBase, time: number, out: string, size: { width: number; height: number }, font: string | null): Promise<boolean> {
  for (const at of [time, Math.max(0, time - 0.5)]) {
    await run(
      job.tools.ffmpeg,
      [...QUIET, '-loglevel', 'error', '-ss', at.toFixed(3), '-i', job.source, '-frames:v', '1', '-an', '-vf', frameFilter(size.width, size.height, time, font), out],
      { signal: job.signal }
    )
    if (existsSync(out)) return true
  }
  return false
}

/** Runs `task` over `items` with a few at a time, in order of the results. */
async function pool<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await task(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Key frames at scene changes, timestamped and tiled into contact sheets in `workDir`. The source is only read. */
export async function prepareFrames(job: JobBase): Promise<PreparedFrames> {
  job.onProgress?.('reading', 0)
  const info = await probe(job.tools, job.source, job.signal)
  job.onProgress?.('reading', 1, info.duration)
  const [scenes, loud] = await Promise.all([sceneTimes(job, info.duration), info.hasAudio ? audible(job) : Promise.resolve(false)])
  const planned = planFrames({ duration: info.duration, sceneTimes: scenes })

  const framesDir = join(job.workDir, 'frames')
  await fs.mkdir(framesDir, { recursive: true })
  // Frames are taken at up to 768 px and only scaled down onto the sheets, whose grid depends on how many frames came out.
  const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(info.width, info.height))
  const frameSize = { width: Math.max(2, Math.round(info.width * scale)), height: Math.max(2, Math.round(info.height * scale)) }
  const rawFrame = (i: number): string => join(framesDir, `raw-${String(i).padStart(3, '0')}.png`)
  const font = fontFile()
  let done = 0
  const grabbed = await pool(planned, FRAME_JOBS, async (time, i) => {
    const ok = await grabFrame(job, time, rawFrame(i), frameSize, font)
    job.onProgress?.('frames', ++done / planned.length)
    return ok ? time : null
  })
  const frameTimes: number[] = []
  for (let i = 0; i < planned.length; i++) {
    if (grabbed[i] === null) continue
    await fs.rename(rawFrame(i), join(framesDir, `${String(frameTimes.length).padStart(3, '0')}.png`))
    frameTimes.push(planned[i])
  }
  if (frameTimes.length === 0) throw new VideoError('Could not read any frame of this video')

  const layout = layoutSheets({ count: frameTimes.length, width: info.width, height: info.height })
  const sheets: PreparedSheet[] = []
  for (const [i, sheet] of layout.sheets.entries()) {
    job.onProgress?.('sheets', i / layout.sheets.length)
    const path = join(job.workDir, `sheet-${i + 1}.jpg`)
    const tile = `scale=${layout.cellWidth}:${layout.cellHeight},trim=end_frame=${sheet.count},tile=${sheet.cols}x${sheet.rows}:padding=${SHEET_PADDING}:margin=${SHEET_PADDING}:color=0x1e1e1e`
    const result = await run(
      job.tools.ffmpeg,
      [...QUIET, '-loglevel', 'error', '-framerate', '1', '-start_number', String(sheet.first), '-i', join(framesDir, '%03d.png'), '-vf', tile, '-frames:v', '1', '-q:v', '3', path],
      { signal: job.signal }
    )
    if (result.code !== 0 || !existsSync(path)) throw new VideoError('Could not build the contact sheets')
    sheets.push({ path, width: sheet.width, height: sheet.height, first: sheet.first, count: sheet.count })
  }
  job.onProgress?.('sheets', 1)
  return { ...info, audible: loud, frameTimes, sheets }
}

/** The speech as timestamped segments, by ffmpeg's `whisper` filter with the language detected. */
export async function transcribe(job: JobBase & { modelPath: string; duration: number }): Promise<TranscriptSegment[]> {
  const out = join(job.workDir, 'transcript.json')
  await fs.mkdir(job.workDir, { recursive: true })
  await fs.rm(out, { force: true })
  const whisper = `aresample=16000,whisper=model=${filterValue(job.modelPath)}:language=auto:queue=10:destination=${filterValue(out)}:format=json`
  job.onProgress?.('transcribing', 0)
  const result = await run(job.tools.ffmpeg, [...QUIET, '-i', job.source, '-vn', '-sn', '-af', whisper, '-f', 'null', '-'], {
    signal: job.signal,
    onStderr: progressOf(job.duration, (f) => job.onProgress?.('transcribing', f))
  })
  if (result.code !== 0) throw new VideoError(`Could not transcribe this video: ${lastLine(result.stderr)}`)
  // The filter writes nothing when it heard no speech.
  const text = await fs.readFile(out, 'utf8').catch(() => '')
  job.onProgress?.('transcribing', 1)
  return parseWhisperJson(text)
}
