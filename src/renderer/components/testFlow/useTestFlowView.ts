import { useEffect, useState } from 'react'
import type { TestFlowView } from '../../../shared/testFlow'

type Shown = { key: string; view: TestFlowView } | null

/**
 * What the finder's candidates show: the first that exists, read again whenever main says a shown or awaited file
 * changed. The last view stays up while a rewrite is read, so a reload does not blank the tab.
 */
export function useTestFlowView(paths: readonly string[]): TestFlowView | null {
  const [watcher] = useState(() => crypto.randomUUID())
  const [revision, setRevision] = useState(0)
  const [shown, setShown] = useState<Shown>(null)
  const key = paths.join('\n')

  useEffect(() => window.api.testFlow.onChanged((changed) => changed === watcher && setRevision((r) => r + 1)), [watcher])
  useEffect(
    () => () => {
      void window.api.testFlow.release(watcher).catch(() => undefined)
    },
    [watcher]
  )

  useEffect(() => {
    if (!key) {
      void window.api.testFlow.release(watcher).catch(() => undefined)
      return
    }
    let active = true
    window.api.testFlow
      .show(watcher, key.split('\n'))
      .then((view) => active && setShown({ key, view }))
      .catch((err) => {
        console.error('could not read the test flow', err)
        if (active) setShown({ key, view: { found: false } })
      })
    return () => {
      active = false
    }
  }, [watcher, key, revision])

  return key && shown?.key === key ? shown.view : null
}

/** Equal for views that look the same, so a change event that altered nothing marks nothing new. */
export function viewKeyOf(view: TestFlowView | null): string | null {
  if (!view) return null
  if (view.kind === 'html') return `html\n${view.url}`
  if (view.kind === 'md') return `md\n${view.name}\n${view.text}`
  return 'none'
}
