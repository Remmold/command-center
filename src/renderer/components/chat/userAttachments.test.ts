import { describe, expect, it } from 'vitest'
import type { UserMessageItem } from './types'
import { mediaAttachments } from './chatMedia'
import { fitThumbnail, sentAttachments, THUMB_MAX_BYTES, thumbSize, userBubble, previewKey, withThumbnails } from './userAttachments'

const dataUrl = (bytes: number): string => `data:image/jpeg;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`

describe('the attachments a sent prompt keeps', () => {
  const image = { kind: 'image' as const, mediaType: 'image/png', base64: 'iVBORw0KGgo=', name: 'shot.png' }
  const pdf = { kind: 'pdf' as const, mediaType: 'application/pdf', base64: 'JVBE', name: 'paper.pdf' }
  const video = { kind: 'video' as const, name: 'clip.mp4', sheets: [{ base64: '/9j/sheet', width: 900, height: 600 }], text: 'Video: clip.mp4', sourcePath: null }

  it('are a summary of each in order the moment it is sent', () => {
    expect(sentAttachments([image, pdf, video])).toEqual([
      { kind: 'image', name: 'shot.png', mediaType: 'image/png' },
      { kind: 'pdf', name: 'paper.pdf', mediaType: 'application/pdf' },
      { kind: 'video', name: 'clip.mp4', mediaType: 'image/jpeg' }
    ])
  })

  it('then gain a thumbnail for images and a video poster, never the full data', async () => {
    const made: string[] = []
    const kept = await withThumbnails([image, pdf, video], async (url) => {
      made.push(url)
      return `thumb of ${url.slice(0, url.indexOf(','))}`
    })
    expect(kept).toEqual([
      { kind: 'image', name: 'shot.png', mediaType: 'image/png', thumb: 'thumb of data:image/png;base64' },
      { kind: 'pdf', name: 'paper.pdf', mediaType: 'application/pdf' },
      { kind: 'video', name: 'clip.mp4', mediaType: 'image/jpeg', thumb: 'thumb of data:image/jpeg;base64' }
    ])
    expect(made).toEqual(['data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/sheet'])
  })

  it('keep an image without a thumbnail when one cannot be made', async () => {
    expect(await withThumbnails([image], async () => undefined)).toEqual([{ kind: 'image', name: 'shot.png', mediaType: 'image/png' }])
  })

  it('preview from the same in-memory image the Media tab shows', () => {
    const [media] = mediaAttachments('m1', [image])
    expect(previewKey('m1', 0)).toBe(media.id)
  })
})

describe('a thumbnail', () => {
  it('fits 320 px on its long side and never grows a small image', () => {
    expect(thumbSize(1920, 1080)).toEqual({ width: 320, height: 180 })
    expect(thumbSize(600, 1200)).toEqual({ width: 160, height: 320 })
    expect(thumbSize(100, 40)).toEqual({ width: 100, height: 40 })
  })

  it('takes the first encoding under the cap, so a saved chat grows at most 40 kB an image', () => {
    expect(THUMB_MAX_BYTES).toBeLessThanOrEqual(40_000)
    const big = dataUrl(90_000)
    const fits = dataUrl(30_000)
    expect(fitThumbnail([() => big, () => fits, () => dataUrl(10_000)])).toBe(fits)
  })

  it('is left out when no encoding fits the cap', () => {
    expect(fitThumbnail([() => dataUrl(THUMB_MAX_BYTES + 1), () => 'data:,'])).toBeUndefined()
  })
})

describe('a saved prompt bubble', () => {
  const user = (text: string, extra: Partial<UserMessageItem> = {}): UserMessageItem => ({ kind: 'user', id: 'u', text, ...extra })

  it('shows an old item\'s marker as attachments not kept, without the marker text', () => {
    expect(userBubble(user('look\n\n_[1 image attached]_'))).toEqual({ text: 'look', attachments: [], notKept: '1 image (not kept)' })
    expect(userBubble(user('\n\n_[3 files attached]_'))).toEqual({ text: '', attachments: [], notKept: '3 files (not kept)' })
  })

  it('shows a new item as it is', () => {
    const attachments = [{ kind: 'pdf' as const, name: 'a.pdf', mediaType: 'application/pdf' }]
    expect(userBubble(user('read', { attachments }))).toEqual({ text: 'read', attachments, notKept: null })
    expect(userBubble(user('plain'))).toEqual({ text: 'plain', attachments: [], notKept: null })
  })
})
