import { describe, expect, it } from 'vitest'
import {
  REMOTE_CONTROL_OFF,
  activeNote,
  isRemoteControlCommand,
  remoteControlOffered,
  remoteControlStep,
  toggleIntent,
  type RemoteControlState
} from './remoteControl'

const URL = 'https://claude.ai/code/session_abc'
const connected: RemoteControlState = { status: 'connected', attempt: 1, sessionUrl: URL, connectUrl: 'https://claude.ai/code?environment=', bridgeEpoch: 1 }

describe('remoteControlStep', () => {
  it('goes off → connecting → connected on a reply with a session URL', () => {
    const connecting = remoteControlStep(REMOTE_CONTROL_OFF, { type: 'enable' })
    expect(connecting.state).toEqual({ status: 'connecting', attempt: 1 })
    expect(connecting.notes).toEqual([])
    const reply = { session_url: URL, connect_url: 'https://claude.ai/code?environment=', bridge_epoch: 1, bridge_session_id: 'cse_abc' }
    const done = remoteControlStep(connecting.state, { type: 'enabled', attempt: 1, reply })
    expect(done.state).toEqual(connected)
    expect(done.notes).toEqual([activeNote(URL)])
  })

  it('is an error when the reply has no session URL, as the extension', () => {
    const { state } = remoteControlStep({ status: 'connecting', attempt: 2 }, { type: 'enabled', attempt: 2, reply: {} })
    expect(state).toEqual({ status: 'error', attempt: 2, error: 'Bridge did not return a session URL' })
  })

  it('shows the CLI refusal as an error with a failed-to-connect line', () => {
    const { state, notes } = remoteControlStep({ status: 'connecting', attempt: 1 }, { type: 'enableFailed', attempt: 1, error: 'Not logged in' })
    expect(state).toEqual({ status: 'error', attempt: 1, error: 'Not logged in' })
    expect(notes).toEqual(['Remote Control failed to connect: Not logged in'])
  })

  it('ignores a reply to an attempt that was superseded', () => {
    const off = remoteControlStep({ status: 'connecting', attempt: 1 }, { type: 'disable' }).state
    const late = remoteControlStep(off, { type: 'enabled', attempt: 1, reply: { session_url: URL } })
    expect(late.state).toBe(off)
    expect(late.notes).toEqual([])
  })

  it('turns off at once from connecting, and says so', () => {
    const { state, notes } = remoteControlStep({ status: 'connecting', attempt: 3 }, { type: 'disable' })
    expect(state).toEqual({ status: 'off', attempt: 4 })
    expect(notes).toEqual(['Remote Control disabled.'])
  })

  it('turns off from connected with the disabled line', () => {
    const { state, notes } = remoteControlStep(connected, { type: 'disable' })
    expect(state).toEqual({ status: 'off', attempt: 2 })
    expect(notes).toEqual(['Remote Control disabled.'])
  })

  it('dismisses an error silently', () => {
    const { state, notes } = remoteControlStep({ status: 'error', attempt: 1, error: 'x' }, { type: 'disable' })
    expect(state.status).toBe('off')
    expect(notes).toEqual([])
  })

  it('drops to off when the bridge fails for the current epoch, and only then', () => {
    expect(remoteControlStep(connected, { type: 'bridgeState', state: 'failed', bridgeEpoch: 1 }).state.status).toBe('off')
    expect(remoteControlStep(connected, { type: 'bridgeState', state: 'policy_disabled' }).state.status).toBe('off')
    expect(remoteControlStep(connected, { type: 'bridgeState', state: 'failed', bridgeEpoch: 2 }).state).toBe(connected)
    expect(remoteControlStep(connected, { type: 'bridgeState', state: 'connected', bridgeEpoch: 1 }).state).toBe(connected)
  })

  it('is off after the process exits, with the disabled line only if it was on', () => {
    expect(remoteControlStep(connected, { type: 'exit' }).notes).toEqual(['Remote Control disabled.'])
    expect(remoteControlStep(REMOTE_CONTROL_OFF, { type: 'exit' })).toEqual({ state: REMOTE_CONTROL_OFF, notes: [] })
  })
})

describe('toggleIntent', () => {
  it('turns on from off and off from every other state, an error included (dismiss)', () => {
    expect(toggleIntent(REMOTE_CONTROL_OFF)).toBe('enable')
    expect(toggleIntent({ status: 'connecting', attempt: 1 })).toBe('disable')
    expect(toggleIntent(connected)).toBe('disable')
    expect(toggleIntent({ status: 'error', attempt: 1, error: 'x' })).toBe('disable')
  })
})

describe('isRemoteControlCommand', () => {
  it('takes the bare command and its alias only', () => {
    expect(isRemoteControlCommand('/remote-control')).toBe(true)
    expect(isRemoteControlCommand(' /rc ')).toBe(true)
    expect(isRemoteControlCommand('/rc now')).toBe(false)
    expect(isRemoteControlCommand('/remote')).toBe(false)
  })
})

describe('remoteControlOffered', () => {
  it('is offered unless the CLI says it is unavailable, and always while it is not off', () => {
    expect(remoteControlOffered(undefined, REMOTE_CONTROL_OFF)).toBe(true)
    expect(remoteControlOffered(false, REMOTE_CONTROL_OFF)).toBe(false)
    expect(remoteControlOffered(false, connected)).toBe(true)
  })
})
