import { useEffect, useMemo, useState } from 'react'
import type { TestFlowFocus } from '../../../shared/testFlow'
import { EmptyState } from '../ui/EmptyState'
import { TestFlowPanel } from './TestFlowPanel'
import { useTestFlowView } from './useTestFlowView'

/** The focused Work session's test flow as main forwards it; a push that lands first beats the initial ask. */
function useTestFlowFocus(): TestFlowFocus | null {
  const [focus, setFocus] = useState<TestFlowFocus | null>(null)
  useEffect(() => {
    let pushed = false
    let active = true
    const off = window.api.testFlow.onFocus((next) => {
      pushed = true
      setFocus(next)
    })
    window.api.testFlow
      .focus()
      .then((last) => active && !pushed && setFocus(last))
      .catch((err) => console.error('could not read the focused test flow', err))
    return () => {
      active = false
      off()
    }
  }, [])
  return focus
}

/** The pop-out window's whole page: the test flow of whichever session is focused in Work. */
export function TestFlowWindow() {
  const focus = useTestFlowFocus()
  const paths = useMemo(() => focus?.picks.map((p) => p.path) ?? [], [focus])
  const view = useTestFlowView(paths)
  if (!focus) return <EmptyState>Open a session in Work to show its test flow here.</EmptyState>
  return (
    <div className="relative h-full">
      <TestFlowPanel picks={focus.picks} view={view} folder={focus.folder} repoName={focus.repoName} session={focus.title} />
    </div>
  )
}
