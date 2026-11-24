import { Settings } from 'lucide-react'
import { SETTINGS_SHORTCUT } from '../hooks/useKeyboardShortcuts'
import { APP_VIEWS } from '../../shared/views'
import { useViewStore, type AppView } from '../state/viewStore'
import { SegmentedControl } from './ui/SegmentedControl'
import { TitleBarButton } from './ui/TitleBarButton'
import { UsageStrip } from './UsageStrip'
import { UpdatePill } from './UpdatePill'
import { ApprovalsPill } from './ApprovalsPill'

const VIEW_LABELS: Record<AppView, string> = { dashboard: 'Dashboard', work: 'Work', board: 'Board', context: 'Context' }

const VIEW_OPTIONS = APP_VIEWS.map((value, i) => ({
  value,
  label: VIEW_LABELS[value],
  title: `${VIEW_LABELS[value]} (Ctrl+${i + 1})`
}))

export function TitleBar() {
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
  const settingsOpen = useViewStore((s) => s.settings !== null)
  const openSettings = useViewStore((s) => s.openSettings)
  const closeSettings = useViewStore((s) => s.closeSettings)

  return (
    <header className="flex h-10 shrink-0 items-center border-b border-subtle bg-titlebar">
      <div className="shrink-0 border-r border-subtle px-2">
        <SegmentedControl<AppView> label="view" value={view} onChange={setView} options={VIEW_OPTIONS} />
      </div>
      <span className="flex-1" />
      <ApprovalsPill />
      <UpdatePill />
      <UsageStrip />
      <TitleBarButton label="Settings" tooltip={`Settings (${SETTINGS_SHORTCUT})`} pressed={settingsOpen} onClick={() => (settingsOpen ? closeSettings() : openSettings())}>
        <Settings size={14} strokeWidth={2} />
      </TitleBarButton>
    </header>
  )
}
