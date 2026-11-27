import { useState } from 'react'
import { openFeatureSession, useFeaturesStore } from '../../state/featuresStore'
import { useMainChatStore } from '../../state/mainChatStore'
import { Button } from '../ui/Button'
import { ChatBanner } from './ChatBanner'

/** At the top of a main chat that a Go began: the feature it started, with the way into its session, since the old card went with the old conversation. */
export function MainChatNotice() {
  const started = useMainChatStore((s) => s.info?.justStarted)
  const features = useFeaturesStore((s) => s.features)
  const [problem, setProblem] = useState<string | null>(null)
  if (!started) return null
  const open = async (): Promise<void> => {
    const feature = features.find((f) => f.name.toLowerCase() === started.name.toLowerCase())
    setProblem(feature ? await openFeatureSession(feature) : `No feature called ${started.name} was found.`)
  }
  return (
    <div data-main-chat-notice="">
      <ChatBanner
        action={
          <Button variant="secondary" onClick={() => void open()}>
            Open session
          </Button>
        }
      >
        Started {started.name} in {started.workspace}. It continues in its own session; this main chat starts fresh.
      </ChatBanner>
      {problem && (
        <p role="alert" className="mt-1 text-xs text-error">
          {problem}
        </p>
      )}
    </div>
  )
}
