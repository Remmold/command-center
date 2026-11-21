import { useEffect, useState } from 'react'
import type { StartWithWindowsState } from '../../../shared/types'
import { Checkbox } from '../ui/Checkbox'
import { Page, PageBody, PageGroup, PageHeader, PageNote } from '../ui/Page'

function useStartWithWindows(): [StartWithWindowsState | null, (checked: boolean) => void] {
  const [state, setState] = useState<StartWithWindowsState | null>(null)

  useEffect(() => {
    window.api.startWithWindows
      .get()
      .then(setState)
      .catch((err) => console.error('could not read Start with Windows', err))
    return window.api.startWithWindows.onChanged(setState)
  }, [])

  const toggle = (checked: boolean): void => {
    window.api.startWithWindows
      .set(checked)
      .then(setState)
      .catch((err) => console.error('could not change Start with Windows', err))
  }
  return [state, toggle]
}

export function GeneralSettings() {
  const [startWithWindows, toggle] = useStartWithWindows()

  return (
    <Page label="General">
      <PageHeader title="General" />
      <PageBody>
        <PageGroup title="Startup">
          <Checkbox checked={startWithWindows?.checked ?? false} disabled={!startWithWindows?.enabled} onChange={toggle}>
            Start with Windows
          </Checkbox>
          <PageNote>
            {startWithWindows?.reason
              ? `Not available: ${startWithWindows.reason}.`
              : 'Starts in the tray when you sign in to Windows.'}
          </PageNote>
        </PageGroup>
      </PageBody>
    </Page>
  )
}
