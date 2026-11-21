import { Settings } from 'lucide-react'
import { SETTINGS_SHORTCUT } from '../hooks/useKeyboardShortcuts'
import { useViewStore, type AppView } from '../state/viewStore'
import { ProjectTabs } from './ProjectTabs'
import { SegmentedControl } from './ui/SegmentedControl'
import { TitleBarButton } from './ui/TitleBarButton'
import { UsageStrip } from './UsageStrip'

const VIEW_OPTIONS: { value: AppView; label: string; title: string }[] = [
  { value: 'dashboard', label: 'Dashboard', title: 'Dashboard (Ctrl+1)' },
  { value: 'work', label: 'Work', title: 'Work (Ctrl+2)' },
  { value: 'board', label: 'Board', title: 'Board (Ctrl+3)' }
]

export function TitleBar() {
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
  const settingsOpen = useViewStore((s) => s.settings !== null)
  const openSettings = useViewStore((s) => s.openSettings)

  return (
    <header className="flex h-10 shrink-0 items-center border-b border-subtle bg-titlebar">
      <div className="shrink-0 border-r border-subtle px-2">
        <SegmentedControl<AppView> label="view" value={view} onChange={setView} options={VIEW_OPTIONS} />
      </div>
      {view === 'work' ? <ProjectTabs /> : <span className="flex-1" />}
      <UsageStrip />
      <TitleBarButton label="Settings" tooltip={`Settings (${SETTINGS_SHORTCUT})`} pressed={settingsOpen} onClick={() => openSettings()}>
        <Settings size={14} strokeWidth={2} />
      </TitleBarButton>
    </header>
  )
}
