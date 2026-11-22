import { useEffect, useState } from 'react'
import type { StartWithWindowsState } from '../../../shared/types'
import { useGeneralSettingsStore } from '../../state/generalSettingsStore'
import { useUpdateStore } from '../../state/updateStore'
import { lastCheckLabel } from '../../state/updateLabels'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { DetailRow } from '../ui/DetailRow'
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
  const allowBypass = useGeneralSettingsStore((s) => s.allowDangerouslySkipPermissions)
  const setAllowBypass = useGeneralSettingsStore((s) => s.setAllowDangerouslySkipPermissions)
  const ctrlEnterSends = useGeneralSettingsStore((s) => s.useCtrlEnterToSend)
  const setCtrlEnterSends = useGeneralSettingsStore((s) => s.setUseCtrlEnterToSend)
  const update = useUpdateStore((s) => s.status)
  const checkNow = useUpdateStore((s) => s.check)

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
        <PageGroup
          title="Updates"
          actions={
            <Button variant="secondary" disabled={!update || update.checking} onClick={() => void checkNow()}>
              Check now
            </Button>
          }
        >
          <DetailRow label="Current version" value={update?.version ?? '…'} />
          {update && <PageNote>{lastCheckLabel(update)}</PageNote>}
        </PageGroup>
        <PageGroup title="Sessions">
          <Checkbox checked={allowBypass} onChange={setAllowBypass}>
            Allow Dangerously Skip Permissions
          </Checkbox>
          <PageNote>Allow bypass permissions mode. Recommended only for sandboxes with no internet access.</PageNote>
          <Checkbox checked={ctrlEnterSends} onChange={setCtrlEnterSends}>
            Use Ctrl Enter To Send
          </Checkbox>
          <PageNote>When enabled, use Ctrl/Cmd+Enter to send prompts instead of just Enter. This allows Enter to create new lines.</PageNote>
        </PageGroup>
      </PageBody>
    </Page>
  )
}
