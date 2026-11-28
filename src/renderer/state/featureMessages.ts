import { sendOutcomeMessage } from '../../shared/sendMessage'
import { MAIN_CHAT_OUTCOME } from './actionOutcome'
import { sendToFeature, useFeaturesStore } from './featuresStore'
import { createMessageQueue } from './messageQueue'
import { settleOutcome } from './proposalGo'
import { useSessionStatusStore } from './sessionStatusStore'

const paneOf = (feature: string): string | undefined => useFeaturesStore.getState().features.find((f) => f.name === feature)?.sessionId

/** The app's one queue of send-message cards; it watches the session statuses from its first use on. */
export const featureMessages = createMessageQueue({
  status: (feature) => {
    const pane = paneOf(feature)
    return (pane && useSessionStatusStore.getState().byPane[pane]?.status) || 'idle'
  },
  send: async (feature, text) => {
    const record = useFeaturesStore.getState().features.find((f) => f.name === feature)
    return record ? sendToFeature(record, text) : `no feature is named ${feature} any more.`
  },
  settled: (feature, outcome) => settleOutcome({ kind: 'tell', text: sendOutcomeMessage(feature, outcome) }, MAIN_CHAT_OUTCOME)
})

let watching = false

/** Sends a card's message now or once its session's turn ends; the first call starts watching the statuses. */
export function submitFeatureMessage(feature: string, cardKey: string, text: string) {
  if (!watching) {
    watching = true
    useSessionStatusStore.subscribe(() => featureMessages.tick())
  }
  return featureMessages.submit(feature, cardKey, text)
}
