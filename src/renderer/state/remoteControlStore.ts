import { create } from 'zustand'
import {
  REMOTE_CONTROL_OFF,
  remoteControlStep,
  toggleIntent,
  type RemoteControlEvent,
  type RemoteControlState
} from '../components/chat/remoteControl'
import { useChatItemsStore } from './chatItemsStore'
import type { ControlResult } from '../../shared/types'

/** Sends `remote_control {enabled}` to the chat's process; `enable` may start the process first. */
export type RemoteControlSend = (enabled: boolean) => Promise<ControlResult>

interface RemoteControlStoreState {
  byPane: Record<string, RemoteControlState>
  initialized: boolean
  init: () => void
  dispatch: (paneId: string, event: RemoteControlEvent) => void
  /** `/remote-control`: on from off, otherwise off (an error is dismissed). */
  toggle: (paneId: string, send: RemoteControlSend) => Promise<void>
}

export function remoteControlOf(byPane: Record<string, RemoteControlState>, paneId: string): RemoteControlState {
  return byPane[paneId] ?? REMOTE_CONTROL_OFF
}

function announce(paneId: string, notes: readonly string[]): void {
  if (notes.length === 0) return
  const at = Date.now()
  useChatItemsStore.getState().appendItems(
    paneId,
    notes.map((text) => {
      const id = crypto.randomUUID()
      const content = [{ type: 'text' as const, text }]
      return { kind: 'assistant' as const, id, content, raw: { type: 'assistant' as const, message: { id, role: 'assistant' as const, content } }, at }
    })
  )
}

const control = (paneId: string): RemoteControlSend => (enabled) => window.api.claude.control(paneId, 'remote_control', { enabled })

/** Per chat and per process, as the extension host's channel state; a new process starts off. */
export const useRemoteControlStore = create<RemoteControlStoreState>()((set, get) => {
  const enable = async (paneId: string, send: RemoteControlSend): Promise<void> => {
    get().dispatch(paneId, { type: 'enable' })
    const attempt = remoteControlOf(get().byPane, paneId).attempt
    const res = await send(true)
    const now = remoteControlOf(get().byPane, paneId)
    if (now.attempt !== attempt) {
      // Turned off while this was on its way; the CLI turned it on anyway.
      if (res.ok && now.status === 'off') void control(paneId)(false)
      return
    }
    get().dispatch(paneId, res.ok ? { type: 'enabled', attempt, reply: res.response } : { type: 'enableFailed', attempt, error: res.error })
  }

  return {
    byPane: {},
    initialized: false,
    init: () => {
      if (get().initialized) return
      set({ initialized: true })
      window.api.claude.onInit(({ paneId, init }) => {
        if (init.remoteControl?.autoStart && remoteControlOf(get().byPane, paneId).status === 'off') void enable(paneId, control(paneId))
      })
      window.api.claude.onExit(({ paneId }) => get().dispatch(paneId, { type: 'exit' }))
      window.api.claude.onEvent(({ paneId, event }) => {
        const e = event as { type?: unknown; subtype?: unknown; state?: unknown; bridge_epoch?: unknown }
        if (e.type !== 'system' || e.subtype !== 'bridge_state' || typeof e.state !== 'string') return
        get().dispatch(paneId, { type: 'bridgeState', state: e.state, ...(typeof e.bridge_epoch === 'number' ? { bridgeEpoch: e.bridge_epoch } : {}) })
      })
    },
    dispatch: (paneId, event) => {
      const before = remoteControlOf(get().byPane, paneId)
      const { state, notes } = remoteControlStep(before, event)
      if (state !== before) set((s) => ({ byPane: { ...s.byPane, [paneId]: state } }))
      announce(paneId, notes)
    },
    toggle: async (paneId, send) => {
      const before = remoteControlOf(get().byPane, paneId)
      if (toggleIntent(before) === 'enable') return enable(paneId, send)
      get().dispatch(paneId, { type: 'disable' })
      const res = await send(false)
      // As the extension, a refused turn-off still counts as off.
      if (!res.ok) console.warn('[remote-control] turn-off refused; shown as off:', res.error)
    }
  }
})
