/** Chats to start as soon as they mount, even with history to show; a take-over starts its resumed process at once. */
const requested = new Set<string>()

export function requestStartOnMount(paneId: string): void {
  requested.add(paneId)
}

/** True once per request. */
export function takeStartRequest(paneId: string): boolean {
  return requested.delete(paneId)
}

/** First prompts to send as soon as their chat mounts, which starts its process. */
const sends = new Map<string, string>()

export function requestSendOnMount(paneId: string, prompt: string): void {
  sends.set(paneId, prompt)
}

/** The prompt once per request. */
export function takeSendRequest(paneId: string): string | undefined {
  const prompt = sends.get(paneId)
  sends.delete(paneId)
  return prompt
}
