import { create } from 'zustand'
import { outgoing, type AppOrigin, type OutgoingPrompt } from '../../shared/appPrompts'

/** Chats to start as soon as they mount, even with history to show; a take-over starts its resumed process at once. */
const requested = new Set<string>()

export function requestStartOnMount(paneId: string): void {
  requested.add(paneId)
}

/** True once per request. */
export function takeStartRequest(paneId: string): boolean {
  return requested.delete(paneId)
}

/** Sessions being started whose chat is not hosted yet, e.g. a drift check's while its run file is written. */
const starting = new Set<string>()

/** Counts the session as starting until the returned release is called. */
export function holdStarting(sessionId: string): () => void {
  starting.add(sessionId)
  return () => starting.delete(sessionId)
}

export const startingSessions = (): string[] => [...starting]

/** A promise and the function that settles it. */
export interface Settleable {
  settled: Promise<boolean>
  settle: (value: boolean) => void
}

export function settleable(): Settleable {
  let settle: (value: boolean) => void = () => {}
  const settled = new Promise<boolean>((resolve) => (settle = resolve))
  return { settled, settle }
}

/** A prompt for a chat, told whether it reached the chat's running process. */
export interface ChatSend {
  prompt: OutgoingPrompt
  delivered: (reached: boolean) => void
}

/** How the chat sends a prompt: `origin` is set when the app wrote it. */
export type SendPrompt = (text: string, origin?: AppOrigin) => Promise<boolean>

/** Sends with `send`, which resolves true once the prompt reached the running process; a throw counts as not reached. */
export function deliver(chatSend: ChatSend, send: SendPrompt): void {
  const { text, origin } = outgoing(chatSend.prompt)
  void send(text, origin).then(chatSend.delivered, () => chatSend.delivered(false))
}

/** First prompts to send as soon as their chat mounts, which starts its process. */
const sends = new Map<string, ChatSend>()

/** Resolves true once the prompt reached the chat's running process, false when the process failed to start or the chat closed first. */
export function requestSendOnMount(paneId: string, prompt: OutgoingPrompt): Promise<boolean> {
  const { settled, settle } = settleable()
  sends.get(paneId)?.delivered(false)
  sends.set(paneId, { prompt, delivered: settle })
  return settled
}

/** The send once per request. */
export function takeSendRequest(paneId: string): ChatSend | undefined {
  const send = sends.get(paneId)
  sends.delete(paneId)
  return send
}

interface ChatSendsState {
  byPane: Record<string, ChatSend[]>
}

/** Prompts sent to a mounted chat from outside it; the chat sends each as if typed, so a mid-turn chat queues it. */
export const useChatSendsStore = create<ChatSendsState>()(() => ({ byPane: {} }))

/**
 * Resolves true once the prompt reached the chat's running process, false when the process failed to start or the chat
 * closed first. An `AppPrompt` (one the app wrote) shows as an app line, also after a restart.
 */
export function sendToChat(paneId: string, prompt: OutgoingPrompt): Promise<boolean> {
  const { settled, settle } = settleable()
  const send = { prompt, delivered: settle }
  useChatSendsStore.setState((s) => ({ byPane: { ...s.byPane, [paneId]: [...(s.byPane[paneId] ?? []), send] } }))
  return settled
}

/** The chat's waiting sends, each once. */
export function takeChatSends(paneId: string): ChatSend[] {
  const waiting = useChatSendsStore.getState().byPane[paneId] ?? []
  if (waiting.length > 0) useChatSendsStore.setState((s) => ({ byPane: { ...s.byPane, [paneId]: [] } }))
  return waiting
}

/** Settles as not reached every waiting send whose chat is no longer hosted, so no caller waits on a closed chat. */
export function dropSendsOfClosed(hosted: (paneId: string) => boolean): void {
  for (const [paneId, send] of sends) {
    if (hosted(paneId)) continue
    sends.delete(paneId)
    send.delivered(false)
  }
  const gone = Object.keys(useChatSendsStore.getState().byPane).filter((paneId) => !hosted(paneId))
  if (gone.length === 0) return
  const byPane = { ...useChatSendsStore.getState().byPane }
  for (const paneId of gone) {
    for (const send of byPane[paneId] ?? []) send.delivered(false)
    delete byPane[paneId]
  }
  useChatSendsStore.setState({ byPane })
}
