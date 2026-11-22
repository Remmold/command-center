/**
 * Remote Control for one chat, as the extension host's `remoteControlState`. `attempt` counts toggles,
 * so a reply to a toggle that a later one superseded is dropped (the host's `remoteControlToggleToken`).
 */
export type RemoteControlState =
  | { status: 'off'; attempt: number }
  | { status: 'connecting'; attempt: number }
  | { status: 'connected'; attempt: number; sessionUrl: string; connectUrl?: string; bridgeEpoch?: number }
  | { status: 'error'; attempt: number; error: string }

export type RemoteControlEvent =
  | { type: 'enable' }
  | { type: 'enabled'; attempt: number; reply: Record<string, unknown> }
  | { type: 'enableFailed'; attempt: number; error: string }
  | { type: 'disable' }
  | { type: 'bridgeState'; state: string; bridgeEpoch?: number }
  | { type: 'exit' }

export interface RemoteControlStep {
  state: RemoteControlState
  /** Lines the chat shows, as the extension's synthetic assistant messages. */
  notes: string[]
}

export const REMOTE_CONTROL_OFF: RemoteControlState = { status: 'off', attempt: 0 }

const DISABLED = 'Remote Control disabled.'
const NO_URL = 'Bridge did not return a session URL'
/** The bridge states that end a connected session (the host's `bridge_state` check). */
const BRIDGE_ENDED: ReadonlySet<string> = new Set(['failed', 'policy_disabled'])

export const REMOTE_CONTROL_COMMAND = 'remote-control'
export const REMOTE_CONTROL_DESCRIPTION = 'View and control this session from claude.ai/code'

export function activeNote(sessionUrl: string): string {
  return `Remote Control is active · Continue here, on your phone, or at [claude.ai/code](${sessionUrl})`
}

const nonEmpty = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined)

function off(state: RemoteControlState, attempt: number): RemoteControlStep {
  const wasOn = state.status === 'connected' || state.status === 'connecting'
  return { state: { status: 'off', attempt }, notes: wasOn ? [DISABLED] : [] }
}

export function remoteControlStep(state: RemoteControlState, event: RemoteControlEvent): RemoteControlStep {
  const same: RemoteControlStep = { state, notes: [] }
  switch (event.type) {
    case 'enable':
      return { state: { status: 'connecting', attempt: state.attempt + 1 }, notes: [] }
    case 'enabled': {
      if (state.status !== 'connecting' || event.attempt !== state.attempt) return same
      const sessionUrl = nonEmpty(event.reply.session_url)
      if (!sessionUrl) return { state: { status: 'error', attempt: state.attempt, error: NO_URL }, notes: [] }
      const connectUrl = nonEmpty(event.reply.connect_url)
      const bridgeEpoch = typeof event.reply.bridge_epoch === 'number' ? event.reply.bridge_epoch : undefined
      return {
        state: { status: 'connected', attempt: state.attempt, sessionUrl, ...(connectUrl ? { connectUrl } : {}), ...(bridgeEpoch !== undefined ? { bridgeEpoch } : {}) },
        notes: [activeNote(sessionUrl)]
      }
    }
    case 'enableFailed':
      if (state.status !== 'connecting' || event.attempt !== state.attempt) return same
      return {
        state: { status: 'error', attempt: state.attempt, error: event.error },
        notes: [`Remote Control failed to connect: ${event.error}`]
      }
    case 'disable':
      return off(state, state.attempt + 1)
    case 'bridgeState':
      if (state.status !== 'connected' || !BRIDGE_ENDED.has(event.state)) return same
      if (event.bridgeEpoch !== undefined && event.bridgeEpoch !== state.bridgeEpoch) return same
      return off(state, state.attempt)
    case 'exit':
      return state.status === 'off' ? same : off(state, state.attempt + 1)
  }
}

/** What `/remote-control` does: from an error it dismisses (turns off), as the extension. */
export function toggleIntent(state: RemoteControlState): 'enable' | 'disable' {
  return state.status === 'off' ? 'enable' : 'disable'
}

/** The bare `/remote-control` or `/rc` the extension answers itself instead of sending. */
export function isRemoteControlCommand(text: string): boolean {
  return /^\/(remote-control|rc)$/.test(text.trim())
}

/** The extension's `remoteControlOffered`: hidden only when the CLI says it can't be offered and it is off. */
export function remoteControlOffered(available: boolean | undefined, state: RemoteControlState): boolean {
  return available !== false || state.status !== 'off'
}
