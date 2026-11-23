import { describe, expect, it } from 'vitest'
import { estimateTokens, layoutSheets, planFrames, videoContextText } from './videoContext'

describe('frame plan', () => {
  it('takes the first frame, each scene change and the last frame, filling long gaps evenly', () => {
    expect(planFrames({ duration: 6, sceneTimes: [3] })).toEqual([0, 1.5, 3, 4.375, 5.75])
  })

  it('drops scene changes closer than the minimum spacing to the one before, or to the end', () => {
    // 100 s: spacing 2.08 s, gaps up to 12.5 s are left alone.
    expect(planFrames({ duration: 100, sceneTimes: [10, 11, 20, 21.5, 30, 40, 50, 60, 70, 80, 90, 99] })).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99.75
    ])
  })

  it('falls back to evenly spaced frames for a static video', () => {
    expect(planFrames({ duration: 80, sceneTimes: [] })).toEqual([0, 9.969, 19.938, 29.906, 39.875, 49.844, 59.813, 69.781, 79.75])
  })

  it('caps the frames, giving up filler frames before scene changes, and always keeps the first and last', () => {
    const scenes = Array.from({ length: 40 }, (_, i) => 10 + i * 15)
    const times = planFrames({ duration: 600, sceneTimes: scenes })
    expect(times).toHaveLength(24)
    expect(times[0]).toBe(0)
    expect(times.at(-1)).toBe(599.75)
    expect(times.slice(1, -1).every((t) => scenes.includes(t))).toBe(true)
  })

  it('takes a single frame of a video too short to have two', () => {
    expect(planFrames({ duration: 0.04, sceneTimes: [] })).toEqual([0])
    expect(planFrames({ duration: 0, sceneTimes: [] })).toEqual([0])
  })
})

describe('sheet layout', () => {
  it('tiles a landscape video 3×3, spreading the frames evenly over the sheets, within 1,568 px', () => {
    expect(layoutSheets({ count: 24, width: 1920, height: 1080 })).toEqual({
      cellWidth: 517,
      cellHeight: 291,
      sheets: [
        { first: 0, count: 8, cols: 3, rows: 3, width: 1567, height: 889 },
        { first: 8, count: 8, cols: 3, rows: 3, width: 1567, height: 889 },
        { first: 16, count: 8, cols: 3, rows: 3, width: 1567, height: 889 }
      ]
    })
  })

  it('tiles a portrait video 3×3 with the height as the long side', () => {
    expect(layoutSheets({ count: 9, width: 1080, height: 1920 })).toEqual({
      cellWidth: 291,
      cellHeight: 517,
      sheets: [{ first: 0, count: 9, cols: 3, rows: 3, width: 889, height: 1567 }]
    })
  })

  it('uses 2×2 for a few frames, never scaling a small video up', () => {
    expect(layoutSheets({ count: 3, width: 640, height: 360 })).toEqual({
      cellWidth: 640,
      cellHeight: 360,
      sheets: [{ first: 0, count: 3, cols: 2, rows: 2, width: 1292, height: 732 }]
    })
  })

  it('uses 2×2 for a very wide video and keeps each frame within 768 px', () => {
    const layout = layoutSheets({ count: 5, width: 3840, height: 1080 })
    expect(layout.cellWidth).toBe(768)
    expect(layout.cellHeight).toBe(216)
    expect(layout.sheets.map((s) => [s.count, s.cols, s.rows])).toEqual([
      [3, 2, 2],
      [2, 2, 1]
    ])
  })
})

describe('video context text', () => {
  const sheets = [
    { first: 0, count: 3, cols: 2, rows: 2, width: 1292, height: 732 },
    { first: 3, count: 2, cols: 2, rows: 1, width: 1292, height: 368 }
  ]
  const frameTimes = [0, 1.5, 3, 61.2, 101.75]

  it('heads the transcript with the name, length and frames, lists each sheet’s frame times, then stamps each segment', () => {
    const text = videoContextText({
      name: 'demo.mp4',
      duration: 102.4,
      frameTimes,
      sheets,
      speech: {
        kind: 'transcript',
        segments: [
          { start: 3.2, end: 7.4, text: ' Hello Andreas. ' },
          { start: 11, end: 12, text: '' },
          { start: 3725.9, end: 3730, text: 'Much later.' }
        ]
      }
    })
    expect(text).toBe(
      [
        'Video: demo.mp4 · 1:42 · 5 frames on 2 sheets',
        'Sheet 1: 0:00 · 0:01 · 0:03',
        'Sheet 2: 1:01 · 1:41',
        '[00:00:03] Hello Andreas.',
        '[01:02:05] Much later.'
      ].join('\n')
    )
  })

  it('says why there is no transcript, in the singular for one frame', () => {
    const text = videoContextText({
      name: 'still.gif',
      duration: 4000,
      frameTimes: [0],
      sheets: [{ first: 0, count: 1 }],
      speech: { kind: 'none', reason: 'the video has no audio' }
    })
    expect(text).toBe(['Video: still.gif · 1:06:40 · 1 frame on 1 sheet', 'Sheet 1: 0:00', 'No transcript: the video has no audio.'].join('\n'))
  })

  it('truncates a long transcript with a note of what was left out', () => {
    const segments = Array.from({ length: 10 }, (_, i) => ({ start: i * 10, end: i * 10 + 9, text: `segment number ${i}` }))
    const text = videoContextText({ name: 'talk.mp4', duration: 100, frameTimes: [0], sheets: sheets.slice(0, 1), speech: { kind: 'transcript', segments }, maxChars: 200 })
    const lines = text.split('\n')
    expect(lines.slice(2)).toEqual([
      '[00:00:00] segment number 0',
      '[00:00:10] segment number 1',
      '[00:00:20] segment number 2',
      '[Transcript truncated: 7 more segments, up to 00:01:39]'
    ])
    expect(text.length).toBeLessThanOrEqual(200)
  })
})

describe('token estimate', () => {
  it('counts each sheet as Claude bills an image, capped at about 1.15 megapixels, plus the text at four characters a token', () => {
    const sheets = [
      { width: 1567, height: 889 },
      { width: 1292, height: 732 }
    ]
    expect(estimateTokens(sheets, 'x'.repeat(400))).toBe(1534 + 1261 + 100)
  })

  it('scales an image over 1,568 px down first', () => {
    expect(estimateTokens([{ width: 3136, height: 400 }], '')).toBe(Math.ceil((1568 * 200) / 750))
  })
})
