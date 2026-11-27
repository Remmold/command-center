import { writeActionBlock, type ActionBlockKind } from './actionBlocks'

export const SEND_MESSAGE_TAG = 'send-message'

export interface SendMessageBlock {
  /** A feature name from the digest. */
  feature: string
  /** Sent verbatim as the user's message to that feature's session; may span lines and hold fenced code. */
  message: string
}

const PARTS: ActionBlockKind<keyof SendMessageBlock>['parts'] = [
  { label: 'feature', oneLine: true },
  { label: 'message', oneLine: false }
]

export const writeSendMessage = (block: SendMessageBlock): string => writeActionBlock({ tag: SEND_MESSAGE_TAG, parts: PARTS, instructions: [] }, block)

export const sendMessageOf = (fields: Record<string, string>): SendMessageBlock => ({ feature: fields.feature, message: fields.message })

const EXAMPLE = writeSendMessage({
  feature: '<a feature name from the digest, exactly as its ## heading>',
  message: "<the message, in the user's words and intent; it may span lines and hold fenced code>"
})

const INSTRUCTIONS = [
  "Messaging a feature's session: when the user asks you to tell, ask or instruct a feature's session something, write one send-message block (the fence is four backticks so the message may hold fenced code):",
  EXAMPLE,
  'Rules for sending a message:',
  '- Only when the user asks for it; never on your own initiative. Say what the user asked, faithfully: add only what they agreed to, and nothing from files unless they asked you to pass it on.',
  '- One block per message, to one feature named exactly as in the digest. Ordinary sessions that are not features cannot be messaged.',
  '- The app sends it as if the user typed it into that session, so that session still asks the user before it edits or runs anything. A session that is busy gets it once its turn ends; a newer message to the same feature replaces one still waiting.',
  '- After the block, tell the user to press Send on the card. The app reports in a message beginning [Command Center] when it was sent.'
]

/** The send-message kind; an older card reads Superseded unless this app session sent it. */
export const SEND_MESSAGE_BLOCK: ActionBlockKind<keyof SendMessageBlock> = { tag: SEND_MESSAGE_TAG, parts: PARTS, instructions: INSTRUCTIONS }

/** Where a card's message stands: sent, waiting for the session's turn to end, replaced by a newer one, or not delivered. */
export type QueuedSend = { state: 'sent' } | { state: 'queued' } | { state: 'replaced' } | { state: 'failed'; error: string }

/** The one message the app sends the main chat once a send settled; queued sends report when they actually go. */
export function sendOutcomeMessage(feature: string, outcome: { queued: boolean } | { error: string }): string {
  if ('error' in outcome) return `[Command Center] The message to ${feature} was not delivered: ${outcome.error} Report this to the user and wait for them.`
  return `[Command Center] Sent to ${feature}${outcome.queued ? ', once its turn had ended' : ''}. Confirm this to the user in words.`
}
