import { useState } from 'react'
import { SecondaryLine } from '../ui/SecondaryLine'
import { useToolContext } from './toolContext'
import { RUN_IN_BACKGROUND, foregroundIds, outcomeMessage, type BackgroundOutcome } from './runInBackground'

/** The extension's `run-in-background-line` under a running shell or agent call the CLI could still move. */
export function RunInBackgroundLine({ toolUseId }: { toolUseId: string }) {
  const { background } = useToolContext()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<BackgroundOutcome | undefined>(undefined)
  if (!background) return null
  const ids = foregroundIds(background.foreground, [toolUseId])
  if (ids.length === 0 || outcome === 'moved' || (outcome === undefined && background.refused)) return null

  const move = (): void => {
    if (busy) return
    setBusy(true)
    setOutcome(undefined)
    background.move(ids).then(
      (result) => {
        setBusy(false)
        setOutcome(result)
      },
      () => {
        setBusy(false)
        setOutcome('failed')
      }
    )
  }

  return (
    <div data-testid="run-in-background-line" className="flex flex-col">
      <div role="status">{outcome !== undefined && <SecondaryLine>{outcomeMessage(outcome)}</SecondaryLine>}</div>
      {(outcome === undefined || outcome === 'failed') && <SecondaryLine onClick={move}>{RUN_IN_BACKGROUND}</SecondaryLine>}
    </div>
  )
}
