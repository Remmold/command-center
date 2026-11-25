import { create } from 'zustand'

/** Chats to start as soon as they mount, even with history to show; a take-over starts its resumed process at once. */
const requested = new Set<string>()

export function requestStartOnMount(paneId: string): void {
  requested.add(paneId)
}

/** True once per request. */
export function takeStartRequest(paneId: string): boolean {
  return requested.delete(paneId)
}

/** A prompt for a chat, told whether it reached the chat's running process. */
export interface ChatSend {
  prompt: string
  delivered: (reached: boolean) => void
}

/** A send and the promise its `delivered` settles. */
function chatSend(prompt: string): { send: ChatSend; reached: Promise<boolean> } {
  let delivered: (reached: boolean) => void = () => {}
  const reached = new Promise<boolean>((resolve) => (delivered = resolve))
  return { send: { prompt, delivered }, reached }
}

/** First prompts to send as soon as their chat mounts, which starts its process. */
const sends = new Map<string, ChatSend>()

/** Resolves true once the prompt reached the chat's running process, false when the process failed to start. */
export function requestSendOnMount(paneId: string, prompt: string): Promise<boolean> {
  const { send, reached } = chatSend(prompt)
  sends.set(paneId, send)
  return reached
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

/** Resolves true once the prompt reached the chat's running process, false when the process failed to start. */
export function sendToChat(paneId: string, prompt: string): Promise<boolean> {
  const { send, reached } = chatSend(prompt)
  useChatSendsStore.setState((s) => ({ byPane: { ...s.byPane, [paneId]: [...(s.byPane[paneId] ?? []), send] } }))
  return reached
}

/** The chat's waiting sends, each once. */
export function takeChatSends(paneId: string): ChatSend[] {
  const waiting = useChatSendsStore.getState().byPane[paneId] ?? []
  if (waiting.length > 0) useChatSendsStore.setState((s) => ({ byPane: { ...s.byPane, [paneId]: [] } }))
  return waiting
}
