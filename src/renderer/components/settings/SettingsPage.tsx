import { useEffect, type ComponentType } from 'react'
import { AppWindow, FolderTree, KanbanSquare, Settings2, UserRound, X, type LucideIcon } from 'lucide-react'
import { useViewStore, type SettingsSection } from '../../state/viewStore'
import { SETTINGS_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { AppsDashboard } from '../AppsDashboard'
import { IconButton } from '../ui/IconButton'
import { ListRow, ListRowText } from '../ui/ListRow'
import { isTyping, overlayOpen } from '../ui/overlay'
import { SectionHeader } from '../ui/SectionHeader'
import { SidebarLayout } from '../ui/SidebarLayout'
import { AccountsSettings } from './AccountsSettings'
import { BoardSettings } from './BoardSettings'
import { GeneralSettings } from './GeneralSettings'
import { WorkspacesSettings } from './WorkspacesSettings'

interface SectionEntry {
  id: SettingsSection
  label: string
  icon: LucideIcon
  body: ComponentType
}

const SECTIONS: SectionEntry[] = [
  { id: 'workspaces', label: 'Workspaces', icon: FolderTree, body: WorkspacesSettings },
  { id: 'accounts', label: 'Accounts', icon: UserRound, body: AccountsSettings },
  { id: 'apps', label: 'Apps', icon: AppWindow, body: AppsDashboard },
  { id: 'board', label: 'Board', icon: KanbanSquare, body: BoardSettings },
  { id: 'general', label: 'General', icon: Settings2, body: GeneralSettings }
]

/** The full-window Settings overlay. Escape closes it, unless a popover is open or a field has focus. */
export function SettingsPage({ section }: { section: SettingsSection }) {
  const openSettings = useViewStore((s) => s.openSettings)
  const closeSettings = useViewStore((s) => s.closeSettings)
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]
  const Body = current.body

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || overlayOpen()) return
      if (isTyping(e.target)) (e.target as HTMLElement).blur()
      else closeSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeSettings])

  return (
    <SidebarLayout
      sidebar={
        <nav aria-label="Settings sections">
          <SectionHeader title="Settings">
            <IconButton label="Close settings" tooltip={`Close settings (Esc), open with ${SETTINGS_SHORTCUT}`} onClick={closeSettings}>
              <X size={14} />
            </IconButton>
          </SectionHeader>
          <ul>
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <ListRow key={id} active={id === current.id} onClick={() => openSettings(id)}>
                <Icon size={14} strokeWidth={1.75} />
                <ListRowText primary={label} />
              </ListRow>
            ))}
          </ul>
        </nav>
      }
    >
      <Body />
    </SidebarLayout>
  )
}
