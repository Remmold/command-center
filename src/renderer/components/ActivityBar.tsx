import {
  Files,
  GitBranch,
  Search,
  Settings,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import { useProjectViewsStore, type ActivityView } from '../state/projectViewsStore'

interface ActivityItem {
  id: NonNullable<ActivityView>
  Icon: LucideIcon
  label: string
}

const ITEMS: ActivityItem[] = [
  { id: 'explorer', Icon: Files, label: 'Explorer' },
  { id: 'sourceControl', Icon: GitBranch, label: 'Source control' }
]

const DISABLED_ITEMS: { Icon: LucideIcon; label: string }[] = [
  { Icon: Search, label: 'Search (coming soon)' },
  { Icon: Sparkles, label: 'Agents (coming soon)' }
]

const DISABLED_FOOTER: { Icon: LucideIcon; label: string }[] = [
  { Icon: Settings, label: 'Settings (coming soon)' }
]

export function ActivityBar() {
  const activityView = useProjectViewsStore((s) => s.activityView)
  const setActivityView = useProjectViewsStore((s) => s.setActivityView)

  return (
    <aside className="flex h-full w-11 shrink-0 flex-col items-center justify-between border-r border-subtle bg-sidebar py-2">
      <div className="flex flex-col items-center gap-1">
        {ITEMS.map((item) => {
          const active = item.id === activityView
          return (
            <button
              key={item.id}
              onClick={() => setActivityView(active ? null : item.id)}
              className={
                'group relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ' +
                (active
                  ? 'text-fg'
                  : 'text-muted hover:bg-list-hover hover:text-fg')
              }
              title={item.label}
              aria-label={item.label}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
              )}
              <item.Icon size={20} strokeWidth={1.75} />
            </button>
          )
        })}
        {DISABLED_ITEMS.map((item, i) => (
          <button
            key={`disabled-${i}`}
            disabled
            className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-md text-faint"
            title={item.label}
            aria-label={item.label}
          >
            <item.Icon size={20} strokeWidth={1.75} />
          </button>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1">
        {DISABLED_FOOTER.map((item, i) => (
          <button
            key={`footer-${i}`}
            disabled
            className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-md text-faint"
            title={item.label}
            aria-label={item.label}
          >
            <item.Icon size={20} strokeWidth={1.75} />
          </button>
        ))}
      </div>
    </aside>
  )
}
