import { describe, expect, it } from 'vitest'
import { pickUp, RAN_AHEAD_NOTICE, type HeldPrompt } from './heldPrompts'

const a: HeldPrompt = { uuid: 'a', text: 'first' }
const b: HeldPrompt = { uuid: 'b', text: 'second' }
const c: HeldPrompt = { uuid: 'c', text: 'third' }

const lifecycle = (uuid: string, state: string, extra: Record<string, unknown> = {}) => ({
  type: 'command_lifecycle',
  command_uuid: uuid,
  state,
  uuid: 'frame-id',
  session_id: 's',
  ...extra
})
const replay = (uuid: string) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text: 'x' }] },
  uuid,
  isReplay: true
})

describe('queued prompts', () => {
  it('stay queued on the CLI\'s "queued" frame', () => {
    expect(pickUp([a, b], lifecycle('a', 'queued'))).toEqual({ pickedUp: [], held: [a, b], startsTurn: false })
  })

  it('"started" releases that prompt and every one queued before it, and starts a turn', () => {
    expect(pickUp([a, b, c], lifecycle('b', 'started'))).toEqual({ pickedUp: [a, b], held: [c], startsTurn: true })
  })

  it('the replay echo of a prompt releases it like "started"', () => {
    expect(pickUp([a, b], replay('a'))).toEqual({ pickedUp: [a], held: [b], startsTurn: true })
  })

  it('an ending state releases only that prompt and starts no turn', () => {
    for (const state of ['completed', 'cancelled', 'discarded', 'refused']) {
      expect(pickUp([a, b, c], lifecycle('b', state))).toEqual({ pickedUp: [b], held: [a, c], startsTurn: false })
    }
  })

  it('frames for prompts it is not holding change nothing', () => {
    expect(pickUp([a], lifecycle('zz', 'started'))).toEqual({ pickedUp: [], held: [a], startsTurn: false })
    expect(pickUp([a], replay('zz'))).toEqual({ pickedUp: [], held: [a], startsTurn: false })
    expect(pickUp([a], { type: 'assistant', message: { content: [] } })).toEqual({ pickedUp: [], held: [a], startsTurn: false })
  })

  it('a plain user event (a tool result) is not a replay', () => {
    expect(pickUp([a], { type: 'user', uuid: 'a', message: { content: [] } }).pickedUp).toEqual([])
  })

  it('ran_ahead marks the prompt with the extension\'s notice and keeps it queued', () => {
    const next = pickUp([a, b], lifecycle('b', 'queued', { ran_ahead: true }))
    expect(next).toEqual({ pickedUp: [], held: [a, { ...b, notice: RAN_AHEAD_NOTICE }], startsTurn: false })
    expect(RAN_AHEAD_NOTICE).toBe('Ran at once, while Claude was working.')
  })
})
