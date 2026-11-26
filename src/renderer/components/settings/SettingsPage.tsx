import { useEffect, type ComponentType } from 'react'
import { AppWindow, FolderTree, Globe, Bot, KanbanSquare, Settings2, UserRound, X, type LucideIcon } from 'lucide-react'
import { useViewStore, type SettingsSection } from '../../state/viewStore'
import { SETTINGS_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { AppsDashboard } from '../AppsDashboard'
import { IconButton } from '../ui/IconButton'
import { ListRow, ListRowText } from '../ui/ListRow'
import { isTyping, keyCaptureOpen, overlayOpen } from '../ui/overlay'
import { SectionHeader } from '../ui/SectionHeader'
import { SidebarLayout } from '../ui/SidebarLayout'
import { AccountsSettings } from './AccountsSettings'
import { BoardSettings } from './BoardSettings'
import { ClaudeCodeSettings } from './ClaudeCodeSettings'
import { GeneralSettings } from './GeneralSettings'
import { PreviewSettings } from './PreviewSettings'
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
  { id: 'claude-code', label: 'Claude Code', icon: Bot, body: ClaudeCodeSettings },
  { id: 'apps', label: 'Apps', icon: AppWindow, body: AppsDashboard },
  { id: 'board', label: 'Board', icon: KanbanSquare, body: BoardSettings },
  { id: 'preview', label: 'Preview', icon: Globe, body: PreviewSettings },
  { id: 'general', label: 'General', icon: Settings2, body: GeneralSettings }
]

/** The full-window Settings overlay. Escape closes it, unless a popover is open or a field has focus. */
export function SettingsPage({ section }: { section: SettingsSection }) {
  const openSettings = useViewStore((s) => s.openSettings)
  const closeSettings = useViewStore((s) => s.closeSettings)
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]
  const Body = current.body

  useEffect(() => {
    // Focus left in the view underneath would keep taking keystrokes.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || overlayOpen() || keyCaptureOpen()) return
      if (isTyping(e.target)) {
        e.target.blur()
        return
      }
      // Capture phase, so a drawer in the view underneath doesn't close on the same Escape.
      e.stopPropagation()
      closeSettings()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
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
