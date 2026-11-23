import { BrowserWindow, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import { IPC } from '../../shared/ipc-channels'
import type { VideoFramesResult, VideoProgressEvent, VideoSource, VideoTranscriptResult } from '../../shared/video'
import { userDataPath } from '../util/paths'
import { Cancelled, hasWhisperFilter, locateFfmpeg, type FfmpegTools } from './ffmpeg'
import { SpeechModelFile } from './model'
import { prepareFrames, transcribe } from './prepare'

interface Job {
  dir: string
  abort: AbortController
  source?: string
  duration?: number
  /** Running ffmpeg work; Windows keeps its files locked until it ends. */
  work: Set<Promise<unknown>>
}

function track<T>(job: Job, task: () => Promise<T>): Promise<T> {
  const running = task()
  job.work.add(running)
  void running.finally(() => job.work.delete(running)).catch(() => undefined)
  return running
}

const jobs = new Map<string, Job>()
let clearedAtStart: Promise<void> = Promise.resolve()

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

const tempRoot = (): string => userDataPath('video-temp')

/** Job ids come from the renderer, so only plain ids name a folder. */
const safeId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,64}$/.test(id)

async function release(jobId: string): Promise<void> {
  const job = jobs.get(jobId)
  if (!job) return
  jobs.delete(jobId)
  job.abort.abort()
  await Promise.allSettled([...job.work])
  await fs.rm(job.dir, { recursive: true, force: true }).catch(() => undefined)
}

const reasonOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

async function sourcePath(job: Job, source: VideoSource): Promise<{ path: string; original: string | null }> {
  if ('path' in source) return { path: source.path, original: source.path }
  const path = join(job.dir, `source${extname(source.name).toLowerCase().replace(/[^.\w]/g, '') || '.mp4'}`)
  await fs.writeFile(path, source.bytes)
  return { path, original: null }
}

async function prepare(jobId: string, source: VideoSource): Promise<VideoFramesResult> {
  if (!safeId(jobId)) return { ok: false, reason: 'failed', error: 'bad job id' }
  const tools = locateFfmpeg()
  if (!tools) return { ok: false, reason: 'no-ffmpeg' }
  await release(jobId)
  await clearedAtStart
  const job: Job = { dir: join(tempRoot(), jobId), abort: new AbortController(), work: new Set() }
  jobs.set(jobId, job)
  return track(job, () => prepareJob(jobId, job, tools, source))
}

async function prepareJob(jobId: string, job: Job, tools: FfmpegTools, source: VideoSource): Promise<VideoFramesResult> {
  try {
    await fs.mkdir(job.dir, { recursive: true })
    const { path, original } = await sourcePath(job, source)
    job.source = path
    const progress = (stage: VideoProgressEvent['stage'], fraction: number, duration?: number) =>
      broadcast(IPC.VIDEO_PROGRESS, { jobId, stage, fraction, duration } satisfies VideoProgressEvent)
    const [frames, canTranscribe] = await Promise.all([
      prepareFrames({ source: path, workDir: job.dir, tools, onProgress: progress, signal: job.abort.signal }),
      hasWhisperFilter(tools.ffmpeg)
    ])
    job.duration = frames.duration
    const sheets = await Promise.all(
      frames.sheets.map(async ({ path: sheet, ...rest }) => ({ ...rest, base64: (await fs.readFile(sheet)).toString('base64') }))
    )
    return { ok: true, ...frames, sheets, sourcePath: original, canTranscribe }
  } catch (err) {
    if (err instanceof Cancelled || job.abort.signal.aborted) return { ok: false, reason: 'cancelled' }
    return { ok: false, reason: 'failed', error: reasonOf(err) }
  }
}

async function transcribeJob(jobId: string, model: SpeechModelFile, tools: FfmpegTools | null): Promise<VideoTranscriptResult> {
  const job = jobs.get(jobId)
  const source = job?.source
  if (!job || !source || job.abort.signal.aborted) return { ok: false, reason: 'cancelled' }
  const modelPath = model.readyPath()
  if (!modelPath) return { ok: false, reason: 'no-model' }
  if (!tools) return { ok: false, reason: 'failed', error: 'Video needs ffmpeg' }
  try {
    const segments = await track(job, () => transcribe({
      source,
      workDir: join(job.dir, 'speech'),
      tools,
      modelPath,
      duration: job.duration ?? 0,
      signal: job.abort.signal,
      onProgress: (stage, fraction) => broadcast(IPC.VIDEO_PROGRESS, { jobId, stage, fraction })
    }))
    return { ok: true, segments }
  } catch (err) {
    if (err instanceof Cancelled || job.abort.signal.aborted) return { ok: false, reason: 'cancelled' }
    return { ok: false, reason: 'failed', error: reasonOf(err) }
  }
}

/** Video preparation in the main process: frames, sheets, the transcript and the speech model. */
export function registerVideoIpc(): () => void {
  // Folders left by a previous run that quit before sending.
  clearedAtStart = fs.rm(tempRoot(), { recursive: true, force: true }).catch(() => undefined)
  const model = new SpeechModelFile(userDataPath('models'))
  const stopModel = model.onChange((status) => broadcast(IPC.VIDEO_MODEL_CHANGED, status))

  ipcMain.handle(IPC.VIDEO_PREPARE, (_e, jobId: string, source: VideoSource) => prepare(jobId, source))
  ipcMain.handle(IPC.VIDEO_TRANSCRIBE, (_e, jobId: string) => transcribeJob(jobId, model, locateFfmpeg()))
  ipcMain.handle(IPC.VIDEO_RELEASE, (_e, jobId: string) => release(jobId))
  ipcMain.handle(IPC.VIDEO_MODEL_STATUS, () => model.status())
  ipcMain.handle(IPC.VIDEO_MODEL_DOWNLOAD, () => model.download())
  ipcMain.handle(IPC.VIDEO_MODEL_CANCEL, () => model.cancel())
  ipcMain.handle(IPC.VIDEO_MODEL_REMOVE, () => model.remove())

  return () => {
    stopModel()
    model.cancel()
    for (const id of [...jobs.keys()]) void release(id)
  }
}
