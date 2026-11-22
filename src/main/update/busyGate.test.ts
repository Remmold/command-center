import { describe, expect, it } from 'vitest'
import { busyPanes, reduceBusy, type BusyEvent, type BusyState } from './busyGate'

const run = (events: BusyEvent[]): BusyState => events.reduce(reduceBusy, {} as BusyState)

const result = { kind: 'claude-event', paneId: 'a', event: { type: 'result', subtype: 'success' } } as const

describe('busy gate', () => {
  it('a chat whose process is alive but idle is not busy', () => {
    expect(busyPanes(run([{ kind: 'spawned', paneId: 'a' }]))).toEqual([])
  })

  it('a running turn is busy until its result', () => {
    const sent = run([{ kind: 'spawned', paneId: 'a' }, { kind: 'sent', paneId: 'a', uuid: 'u1' }])
    expect(busyPanes(sent)).toEqual(['a'])
    expect(busyPanes(reduceBusy(sent, result))).toEqual([])
  })

  it('a waiting tool approval keeps the chat busy after the turn result', () => {
    const state = run([
      { kind: 'sent', paneId: 'a', uuid: 'u1' },
      { kind: 'approval-raised', paneId: 'a', requestId: 'r1' },
      result
    ])
    expect(busyPanes(state)).toEqual(['a'])
    expect(busyPanes(reduceBusy(state, { kind: 'approval-resolved', paneId: 'a', requestId: 'r1' }))).toEqual([])
  })

  it('a queued prompt that has not started keeps the chat busy across the result', () => {
    const lifecycle = (uuid: string, state: string): BusyEvent => ({
      kind: 'claude-event',
      paneId: 'a',
      event: { type: 'command_lifecycle', command_uuid: uuid, state }
    })
    const state = run([
      { kind: 'sent', paneId: 'a', uuid: 'u1' },
      lifecycle('u1', 'started'),
      { kind: 'sent', paneId: 'a', uuid: 'u2' },
      lifecycle('u2', 'queued'),
      result
    ])
    expect(busyPanes(state)).toEqual(['a'])
    const started = reduceBusy(state, lifecycle('u2', 'started'))
    expect(busyPanes(started)).toEqual(['a'])
    expect(busyPanes(reduceBusy(started, result))).toEqual([])
  })

  it('the CLI echoing a queued prompt counts as it starting', () => {
    const state = run([
      { kind: 'sent', paneId: 'a', uuid: 'u1' },
      { kind: 'claude-event', paneId: 'a', event: { type: 'user', uuid: 'u1', message: { role: 'user', content: 'hi' } } },
      result
    ])
    expect(busyPanes(state)).toEqual([])
  })

  it('Remote Control lines alone never make a chat busy', () => {
    const state = run([
      { kind: 'spawned', paneId: 'a' },
      { kind: 'claude-event', paneId: 'a', event: { type: 'system', subtype: 'bridge_state', state: 'connected' } }
    ])
    expect(busyPanes(state)).toEqual([])
  })

  it('an exited process leaves nothing busy', () => {
    const state = run([
      { kind: 'sent', paneId: 'a', uuid: 'u1' },
      { kind: 'approval-raised', paneId: 'a', requestId: 'r1' },
      { kind: 'exit', paneId: 'a' }
    ])
    expect(busyPanes(state)).toEqual([])
  })

  it('lists every busy chat', () => {
    const state = run([
      { kind: 'sent', paneId: 'a', uuid: 'u1' },
      { kind: 'spawned', paneId: 'b' },
      { kind: 'sent', paneId: 'c', uuid: 'u2' }
    ])
    expect(busyPanes(state)).toEqual(['a', 'c'])
  })
})
