import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Cancelled, locateFfmpeg } from './ffmpeg'
import { prepareFrames, transcribe } from './prepare'

const tools = locateFfmpeg()
if (!tools) console.warn('ffmpeg not found: skipping the video integration tests')
const tinyModel = process.env.WHISPER_TEST_MODEL
const hasTiny = Boolean(tinyModel && existsSync(tinyModel))

describe.skipIf(!tools)('preparing a real video with ffmpeg', () => {
  let dir = ''
  let clip = ''

  beforeAll(() => {
    // A folder with a comma, quote and brackets in its name, as filter graph arguments must survive them.
    dir = mkdtempSync(join(tmpdir(), "cc-video, it's [test]-"))
    clip = join(dir, 'clip.mp4')
    execFileSync(tools!.ffmpeg, [
      ...['-hide_banner', '-loglevel', 'error', '-y'],
      ...['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=3'],
      ...['-f', 'lavfi', '-i', 'smptebars=size=320x240:rate=25:duration=3'],
      ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6'],
      ...['-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a'],
      ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]
    ])
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('takes the first frame, the cut and the last frame onto one sheet, and hears the tone', async () => {
    const work = join(dir, 'job')
    const stages = new Set<string>()
    const frames = await prepareFrames({ source: clip, workDir: work, tools: tools!, onProgress: (stage) => stages.add(stage) })
    expect(frames).toMatchObject({ duration: 6, width: 320, height: 240, hasAudio: true, audible: true })
    expect(frames.frameTimes).toEqual([0, 1.5, 3, 4.375, 5.75])
    expect(frames.sheets).toHaveLength(1)
    const sheet = frames.sheets[0]
    expect(existsSync(sheet.path)).toBe(true)
    const size = execFileSync(tools!.ffprobe, ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', sheet.path]).toString().trim()
    expect(size).toBe(`${sheet.width},${sheet.height}`)
    expect([...stages]).toEqual(['reading', 'scenes', 'frames', 'sheets'])
    expect(existsSync(clip)).toBe(true)
  }, 30_000)

  it('stops at once when cancelled', async () => {
    const abort = new AbortController()
    const running = prepareFrames({ source: clip, workDir: join(dir, 'cancelled'), tools: tools!, signal: abort.signal })
    abort.abort()
    await expect(running).rejects.toBeInstanceOf(Cancelled)
  })

  it.skipIf(!hasTiny)('transcribes with the tiny model (WHISPER_TEST_MODEL)', async () => {
    const segments = await transcribe({ source: clip, workDir: join(dir, 'speech'), tools: tools!, modelPath: tinyModel!, duration: 6 })
    expect(Array.isArray(segments)).toBe(true)
    for (const s of segments) expect(s.end).toBeGreaterThanOrEqual(s.start)
  }, 60_000)
})
