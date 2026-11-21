import { useEffect, useRef } from 'react'
import { useMenu } from '../hooks/useMenu'
import { useMinuteClock } from '../hooks/useMinuteClock'
import type { UsageEntry } from '../state/usageModel'
import { useUsageEntries } from '../state/useUsageEntries'
import { useProfilesStore } from '../state/profilesStore'
import { useWorkspacesStore } from '../state/workspacesStore'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { useViewStore } from '../state/viewStore'
import { useUsagePopoverStore } from '../state/usagePopoverStore'
import { AccountUsagePanel, UsageMeters } from './AccountUsage'
import { Popover } from './ui/Popover'
import { TitleBarButton } from './ui/TitleBarButton'
import { TwoLineLabel } from './ui/TwoLineLabel'

function useProfileOnScreen(): string | null {
  const view = useViewStore((s) => s.view)
  const activeProjectId = useProjectViewsStore((s) => s.activeProjectId)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  if (view !== 'work' || !activeProjectId) return null
  return workspaces.find((w) => w.id === activeProjectId)?.profileId ?? null
}

/** Every account profile with its plan-limit bars; the profile of the chat on screen is highlighted. */
export function UsageStrip() {
  const loadProfiles = useProfilesStore((s) => s.load)
  const now = useMinuteClock()
  const entries = useUsageEntries(useProfileOnScreen(), now)

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  if (entries.length === 0) return null
  const target = (entries.find((e) => e.highlighted) ?? entries[0]).profileId
  return (
    <ul aria-label="usage per account profile" className="flex h-full shrink-0 items-stretch border-l border-subtle">
      {entries.map((entry) => (
        <li key={entry.profileId} className="flex">
          <UsageStripEntry entry={entry} now={now} opensOnRequest={entry.profileId === target} />
        </li>
      ))}
    </ul>
  )
}

function stripNote(entry: UsageEntry): string | null {
  if (entry.state === 'not-logged-in') return 'not logged in'
  return entry.plan
}

function UsageStripEntry({ entry, now, opensOnRequest }: { entry: UsageEntry; now: number; opensOnRequest: boolean }) {
  const menu = useMenu()
  const loadProfiles = useProfilesStore((s) => s.load)
  const request = useUsagePopoverStore((s) => s.nonce)
  const seen = useRef(request)
  const { show } = menu

  useEffect(() => {
    if (request === seen.current) return
    seen.current = request
    if (!opensOnRequest) return
    void loadProfiles()
    show()
  }, [request, opensOnRequest, loadProfiles, show])

  const toggle = () => {
    if (!menu.open) void loadProfiles()
    menu.toggle()
  }

  const tooltip = [entry.label, ...entry.bars.map((b) => b.tooltip)].join('\n')
  return (
    <>
      <TitleBarButton
        ref={menu.setAnchor}
        onClick={toggle}
        label={`Account & usage for ${entry.label}`}
        tooltip={tooltip}
        pressed={menu.open}
        current={entry.highlighted}
      >
        <TwoLineLabel primary={entry.label} secondary={stripNote(entry)} />
        <UsageMeters entry={entry} />
      </TitleBarButton>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" width={320} label="Account & Usage">
        <AccountUsagePanel entry={entry} now={now} />
      </Popover>
    </>
  )
}
