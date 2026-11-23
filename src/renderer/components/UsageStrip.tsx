import { useEffect, useRef } from 'react'
import { useMenu } from '../hooks/useMenu'
import { useMinuteClock } from '../hooks/useMinuteClock'
import type { UsageEntry } from '../state/usageModel'
import { useUsageEntries } from '../state/useUsageEntries'
import { useProfilesStore } from '../state/profilesStore'
import { useViewStore } from '../state/viewStore'
import { useChatPairStore } from '../state/chatPairStore'
import { chatKey, useChatAccountStore } from '../state/chatAccountStore'
import { useAccountColor } from '../state/useAccountColor'
import { AccentDot } from './ui/AccentDot'
import { useUsagePopoverStore } from '../state/usagePopoverStore'
import { AccountUsagePanel, UsageMeters } from './AccountUsage'
import { Popover } from './ui/Popover'
import { TitleBarButton } from './ui/TitleBarButton'
import { TwoLineLabel } from './ui/TwoLineLabel'

/** The account the focused chat in Work runs on, as its header resolved it; null with no chat focused. */
function useFocusedChatAccount(): string | null {
  const view = useViewStore((s) => s.view)
  const focused = useChatPairStore((s) => s.pair.halves[s.pair.focused] ?? null)
  const profileId = useChatAccountStore((s) => (focused ? (s.byChat[chatKey(focused)] ?? null) : null))
  return view === 'work' ? profileId : null
}

/** Every account profile with its plan-limit bars; the focused chat's account is ringed and the others dimmed. */
export function UsageStrip() {
  const loadProfiles = useProfilesStore((s) => s.load)
  const now = useMinuteClock()
  const entries = useUsageEntries(useFocusedChatAccount(), now)

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  if (entries.length === 0) return null
  const target = (entries.find((e) => e.highlighted) ?? entries[0]).profileId
  return (
    <ul aria-label="usage per account profile" className="flex h-full shrink-0 items-stretch border-l border-subtle">
      {entries.map((entry) => (
        <li key={entry.profileId} className="flex">
          <UsageStripEntry entry={entry} now={now} opensOnRequest={entry.profileId === target} dimmed={!entry.highlighted && entries.some((e) => e.highlighted)} />
        </li>
      ))}
    </ul>
  )
}

function stripNote(entry: UsageEntry): string | null {
  if (entry.state === 'not-logged-in') return 'not logged in'
  return entry.plan
}

function UsageStripEntry({ entry, now, opensOnRequest, dimmed }: { entry: UsageEntry; now: number; opensOnRequest: boolean; dimmed: boolean }) {
  const menu = useMenu()
  const color = useAccountColor(entry.profileId)
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

  const tooltip = [entry.email ? `${entry.label} · ${entry.email}` : entry.label, ...entry.bars.map((b) => b.tooltip)].join('\n')
  return (
    <>
      <TitleBarButton
        ref={menu.setAnchor}
        onClick={toggle}
        label={`Account & usage for ${entry.label}`}
        tooltip={tooltip}
        pressed={menu.open}
        current={entry.highlighted}
        dimmed={dimmed}
        accent={color}
      >
        <AccentDot color={color} />
        <TwoLineLabel primary={entry.label} secondary={stripNote(entry)} />
        <UsageMeters entry={entry} />
      </TitleBarButton>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" width={320} label="Account & Usage">
        <AccountUsagePanel entry={entry} now={now} />
      </Popover>
    </>
  )
}
