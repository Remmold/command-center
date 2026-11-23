import type { PromptAttachment } from './attachments'
import type { UserAttachment, UserMessageItem } from './types'
import { ATTACHED_MARKER } from './promptHistory'

export const THUMB_MAX_SIDE = 320
/** A saved chat grows by at most this much per image. */
export const THUMB_MAX_BYTES = 40_000

/** JPEG has no transparency; a transparent image is flattened onto this. */
const JPEG_BACKDROP = 'white'

export type MakeThumb = (dataUrl: string) => Promise<string | undefined>

/** What a sent prompt's item keeps of its attachments, in order; thumbnails come after, from `withThumbnails`. */
export function sentAttachments(attachments: readonly PromptAttachment[]): UserAttachment[] {
  return attachments.map((a) => (a.kind === 'video' ? { kind: 'video', name: a.name, mediaType: 'image/jpeg' } : { kind: a.kind, name: a.name, mediaType: a.mediaType }))
}

function pictureOf(a: PromptAttachment): string | null {
  if (a.kind === 'image') return `data:${a.mediaType};base64,${a.base64}`
  if (a.kind === 'video' && a.sheets[0]) return `data:image/jpeg;base64,${a.sheets[0].base64}`
  return null
}

/** The summary with a small thumbnail of each image, and of each video's first sheet as its poster. */
export async function withThumbnails(attachments: readonly PromptAttachment[], makeThumb: MakeThumb): Promise<UserAttachment[]> {
  const summary = sentAttachments(attachments)
  return Promise.all(
    attachments.map(async (a, i) => {
      const picture = pictureOf(a)
      const thumb = picture ? await makeThumb(picture) : undefined
      return thumb ? { ...summary[i], thumb } : summary[i]
    })
  )
}

/** The id `mediaAttachments` gives the attachment at `index`, whose full image stays in memory while the app runs. */
export function previewKey(messageId: string, index: number): string {
  return `${messageId}#${index}`
}

export function thumbSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function dataUrlBytes(url: string): number {
  return url.length - url.indexOf(',') - 1
}

/** The first encoding that is a real image within the cap, tried in order. */
export function fitThumbnail(encodings: readonly (() => string)[]): string | undefined {
  for (const encode of encodings) {
    const url = encode()
    const bytes = dataUrlBytes(url)
    if (bytes > 0 && bytes <= THUMB_MAX_BYTES) return url
  }
  return undefined
}

/** A PNG keeps transparency when it is small enough; otherwise JPEG at falling quality. */
export const makeThumb: MakeThumb = async (dataUrl) => {
  try {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
    const { width, height } = thumbSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const png = (): string => canvas.toDataURL('image/png')
    const jpeg = (quality: number) => (): string => {
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = JPEG_BACKDROP
      ctx.fillRect(0, 0, width, height)
      return canvas.toDataURL('image/jpeg', quality)
    }
    return fitThumbnail([png, jpeg(0.85), jpeg(0.7), jpeg(0.5), jpeg(0.3)])
  } catch {
    return undefined
  }
}

export interface UserBubble {
  text: string
  attachments: readonly UserAttachment[]
  /** Set for an item saved before attachments were kept: what its marker counted. */
  notKept: string | null
}

const NO_ATTACHMENTS: readonly UserAttachment[] = []

export function userBubble(item: UserMessageItem): UserBubble {
  const marker = ATTACHED_MARKER.exec(item.text)
  if (!marker) return { text: item.text, attachments: item.attachments ?? NO_ATTACHMENTS, notKept: null }
  const counted = marker[0].replace(/^\s*_\[/, '').replace(/ attached\]_$/, '')
  return { text: item.text.slice(0, marker.index).trim(), attachments: item.attachments ?? NO_ATTACHMENTS, notKept: `${counted} (not kept)` }
}
