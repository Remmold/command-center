import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

export interface FfmpegTools {
  ffmpeg: string
  ffprobe: string
}

const exe = (name: string): string => (process.platform === 'win32' ? `${name}.exe` : name)

function withProbe(ffmpeg: string): FfmpegTools | null {
  const ffprobe = join(dirname(ffmpeg), exe('ffprobe'))
  return existsSync(ffmpeg) && existsSync(ffprobe) ? { ffmpeg, ffprobe } : null
}

/** winget's install folder for the gyan.dev build, which is not always on PATH for an app started from the Start menu. */
function wingetCandidates(env: NodeJS.ProcessEnv): string[] {
  const local = env.LOCALAPPDATA
  if (!local) return []
  const packages = join(local, 'Microsoft', 'WinGet', 'Packages')
  const found = [join(local, 'Microsoft', 'WinGet', 'Links', exe('ffmpeg'))]
  try {
    for (const pkg of readdirSync(packages).filter((d) => d.toLowerCase().startsWith('gyan.ffmpeg'))) {
      for (const build of readdirSync(join(packages, pkg))) found.push(join(packages, pkg, build, 'bin', exe('ffmpeg')))
    }
  } catch {
    // No winget packages folder.
  }
  return found
}

/** The system ffmpeg and ffprobe: `CC_FFMPEG` (a path to ffmpeg, or "none" in tests), then PATH, then winget's folder. */
export function locateFfmpeg(env: NodeJS.ProcessEnv = process.env): FfmpegTools | null {
  if (env.CC_FFMPEG) return env.CC_FFMPEG === 'none' ? null : withProbe(env.CC_FFMPEG)
  const onPath = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, exe('ffmpeg')))
  for (const candidate of [...onPath, ...wingetCandidates(env)]) {
    const tools = withProbe(candidate)
    if (tools) return tools
  }
  return null
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

export interface RunOptions {
  signal?: AbortSignal
  /** Each chunk of stderr as it arrives, for progress. */
  onStderr?: (chunk: string) => void
  cwd?: string
}

export class Cancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

/** Runs a tool to the end without a window; an abort stops this one child. */
export function run(file: string, args: readonly string[], { signal, onStderr, cwd }: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Cancelled())
    const child = spawn(file, args, { windowsHide: true, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const abort = () => child.kill()
    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d))
    child.stderr.setEncoding('utf8').on('data', (d: string) => {
      stderr += d
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000)
      onStderr?.(d)
    })
    child.on('error', (err) => {
      signal?.removeEventListener('abort', abort)
      reject(err)
    })
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) reject(new Cancelled())
      else resolve({ code, stdout, stderr })
    })
  })
}

const filterCache = new Map<string, Promise<boolean>>()

/** Whether this ffmpeg was built with whisper.cpp. */
export function hasWhisperFilter(ffmpeg: string): Promise<boolean> {
  let cached = filterCache.get(ffmpeg)
  if (!cached) {
    cached = run(ffmpeg, ['-hide_banner', '-filters'])
      .then((r) => /^\s*\S+\s+whisper\s/m.test(r.stdout))
      .catch(() => false)
    filterCache.set(ffmpeg, cached)
  }
  return cached
}
