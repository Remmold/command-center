import { tellMainChat } from './featuresStore'
import { resetMainChat } from './mainChatStore'
import type { OutcomeDeps } from './proposalGo'

/** Where every card's outcome goes: a fresh main chat, or one line told to it. */
export const MAIN_CHAT_OUTCOME: OutcomeDeps = { reset: (started) => void resetMainChat(started), tell: tellMainChat }
