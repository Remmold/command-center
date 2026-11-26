import { useCallback, useEffect, useRef, useState } from 'react'
import type { Mark, StepsView } from '../../../shared/testSteps'

interface TestSteps {
  /** null while the checklist is read, or when there is none to read. */
  view: StepsView | null
  mark: (hash: string, mark: Mark | null, note?: string) => void
}

/** A feature's checklist and marks, read again whenever main says either file changed; marking works offline, through files only. */
export function useTestStepsView(path: string | null): TestSteps {
  const [watcher] = useState(() => crypto.randomUUID())
  const [revision, setRevision] = useState(0)
  const [shown, setShown] = useState<{ path: string; view: StepsView } | null>(null)
  const watching = useRef(false)

  useEffect(() => window.api.testFlow.onChanged((changed) => changed === watcher && setRevision((r) => r + 1)), [watcher])
  useEffect(
    () => () => {
      void window.api.testFlow.release(watcher).catch(() => undefined)
    },
    [watcher]
  )
  useEffect(() => {
    if (!path) {
      // Most sessions are no feature's; only a path that went away has watches to drop.
      if (watching.current) void window.api.testFlow.release(watcher).catch(() => undefined)
      watching.current = false
      return
    }
    watching.current = true
    let active = true
    window.api.testFlow
      .showSteps(watcher, path)
      .then((view) => active && setShown({ path, view }))
      .catch((err) => {
        console.error('could not read the test steps', err)
        if (active) setShown({ path, view: { found: false } })
      })
    return () => {
      active = false
    }
  }, [watcher, path, revision])

  const mark = useCallback(
    (hash: string, next: Mark | null, note = '') => {
      if (!path) return
      window.api.testFlow
        .markStep(path, hash, next, note)
        .then((view) => setShown({ path, view }))
        .catch((err) => console.error('could not save the mark', err))
    },
    [path]
  )
  return { view: path && shown?.path === path ? shown.view : null, mark }
}
