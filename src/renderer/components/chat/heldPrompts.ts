import type { AppPromptKind } from '../../../shared/appPrompts'
import type { UserAttachment } from './types'

/** A prompt sent while Claude works: already on the CLI's stdin, shown under the live turn until the CLI takes it. */
export interface HeldPrompt {
  uuid: string
  text: string
  attachments?: UserAttachment[]
  appPrompt?: AppPromptKind
  notice?: string
}

export interface Pickup {
  /** Prompts that move into the transcript, oldest first. */
  pickedUp: HeldPrompt[]
  held: HeldPrompt[]
  /** The CLI began working on a picked-up prompt. */
  startsTurn: boolean
}

export const RAN_AHEAD_NOTICE = 'Ran at once, while Claude was working.'

const ENDED = new Set(['completed', 'cancelled', 'discarded', 'refused'])

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** What a CLI event does to the held prompts, as in the extension: `ran_ahead` only marks one. */
export function pickUp(held: readonly HeldPrompt[], event: unknown): Pickup {
  const unchanged: Pickup = { pickedUp: [], held: [...held], startsTurn: false }
  if (!isRecord(event)) return unchanged
  const through = (uuid: unknown): Pickup => {
    const i = held.findIndex((p) => p.uuid === uuid)
    if (i === -1) return unchanged
    return { pickedUp: held.slice(0, i + 1), held: held.slice(i + 1), startsTurn: true }
  }
  if (event.type === 'user' && event.isReplay === true) return through(event.uuid)
  if (event.type !== 'command_lifecycle') return unchanged
  if (event.ran_ahead === true) {
    return { ...unchanged, held: held.map((p) => (p.uuid === event.command_uuid && !p.notice ? { ...p, notice: RAN_AHEAD_NOTICE } : p)) }
  }
  if (event.state === 'started') return through(event.command_uuid)
  if (typeof event.state === 'string' && ENDED.has(event.state)) {
    const i = held.findIndex((p) => p.uuid === event.command_uuid)
    if (i === -1) return unchanged
    return { pickedUp: [held[i]], held: [...held.slice(0, i), ...held.slice(i + 1)], startsTurn: false }
  }
  return unchanged
}
