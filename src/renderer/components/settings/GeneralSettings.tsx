import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { zoomPercent } from '../../../shared/zoom'
import { useZoomStore } from '../../state/zoomStore'
import type { StartWithWindowsState } from '../../../shared/types'
import { useGeneralSettingsStore } from '../../state/generalSettingsStore'
import { useUpdateStore } from '../../state/updateStore'
import { lastCheckLabel } from '../../state/updateLabels'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { DetailRow } from '../ui/DetailRow'
import { Page, PageBody, PageGroup, PageHeader, PageNote } from '../ui/Page'
import { useSpeechModelStore } from '../../state/speechModelStore'
import { SPEECH_MODEL, type SpeechModelStatus } from '../../../shared/video'

const megabytes = (bytes: number): string => `${Math.round(bytes / 1_000_000)} MB`

function modelLabel(status: SpeechModelStatus | null): string {
  if (!status) return '…'
  switch (status.state) {
    case 'absent':
      return 'Not downloaded'
    case 'downloading':
      return `Downloading… ${Math.floor((status.received / status.total) * 100)}%`
    case 'failed':
      return `Download failed: ${status.error}`
    case 'ready':
      return `Downloaded (${megabytes(status.bytes)})`
  }
}

function VideoGroup() {
  const transcription = useGeneralSettingsStore((s) => s.videoTranscription)
  const setTranscription = useGeneralSettingsStore((s) => s.setVideoTranscription)
  const model = useSpeechModelStore((s) => s.status)
  const download = useSpeechModelStore((s) => s.download)
  const cancel = useSpeechModelStore((s) => s.cancel)
  const remove = useSpeechModelStore((s) => s.remove)
  const action =
    model?.state === 'ready' ? (
      <Button variant="secondary" onClick={remove}>
        Remove model
      </Button>
    ) : model?.state === 'downloading' ? (
      <Button variant="secondary" onClick={cancel}>
        Cancel download
      </Button>
    ) : (
      <Button variant="secondary" disabled={!model} onClick={download}>
        Download model
      </Button>
    )
  return (
    <PageGroup title="Video" actions={action}>
      <Checkbox checked={transcription === 'on'} onChange={(on) => setTranscription(on ? 'on' : 'off')}>
        Transcribe speech in videos
      </Checkbox>
      <PageNote>
        A video attached to a prompt goes to Claude as key frames on contact sheets, plus a timestamped transcript of its speech. Transcription
        runs on this computer with the {SPEECH_MODEL.label} model.
      </PageNote>
      <DetailRow label="Speech model" value={modelLabel(model)} />
    </PageGroup>
  )
}

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
  const suggestions = useGeneralSettingsStore((s) => s.promptSuggestions)
  const setSuggestions = useGeneralSettingsStore((s) => s.setPromptSuggestions)
  const update = useUpdateStore((s) => s.status)
  const checkNow = useUpdateStore((s) => s.check)
  const zoomLevel = useZoomStore((s) => s.level)
  const zoom = useZoomStore((s) => s.step)

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
          title="Appearance"
          actions={
            <>
              <Button variant="secondary" label="Zoom out" tooltip="Zoom out (Ctrl+-)" onClick={() => zoom('out')}>
                <Minus size={12} />
              </Button>
              <Button variant="secondary" label="Zoom in" tooltip="Zoom in (Ctrl+=)" onClick={() => zoom('in')}>
                <Plus size={12} />
              </Button>
              <Button variant="secondary" tooltip="Back to 110% (Ctrl+0)" onClick={() => zoom('reset')}>
                Reset
              </Button>
            </>
          }
        >
          <DetailRow label="Zoom" value={`${zoomPercent(zoomLevel)}%`} />
          <PageNote>The size of all text and icons in the window. Each step is about 20%, as in VS Code.</PageNote>
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
          <Checkbox checked={suggestions} onChange={setSuggestions}>
            Suggest next prompt
          </Checkbox>
          <PageNote>
            Claude suggests a next prompt after each reply (uses a little of your usage). Tab puts it in the message box. Applies to chats started
            from now on.
          </PageNote>
        </PageGroup>
        <VideoGroup />
      </PageBody>
    </Page>
  )
}
