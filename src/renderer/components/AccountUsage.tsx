import { LogIn, RefreshCw } from 'lucide-react'
import { profileEnv } from '../../shared/profiles'
import { updatedText, type UsageBarView, type UsageEntry } from '../state/usageModel'
import { loginWorkspace, useProfilesStore } from '../state/profilesStore'
import { useUsageStore } from '../state/usageStore'
import { useWorkspacesStore } from '../state/workspacesStore'
import { openShell } from '../state/sessionNavigation'
import { Button } from './ui/Button'
import { DetailRow } from './ui/DetailRow'
import { Meter } from './ui/Meter'
import { PopoverActions, PopoverDivider, PopoverHeading, PopoverNote, PopoverSection } from './ui/Popover'
import { SectionLabel } from './ui/SectionLabel'
import { StatRow } from './ui/StatRow'

/** The 5-hour and weekly bars, stacked; `fill` stretches them to the container. */
export function UsageMeters({ entry, size = 'compact' }: { entry: UsageEntry; size?: 'compact' | 'fill' }) {
  if (entry.bars.length === 0) return null
  return (
    <span className={`flex flex-col gap-1 ${size === 'fill' ? 'w-full' : ''}`}>
      {entry.bars.map((bar) => (
        <Meter
          key={bar.key}
          percent={bar.percent}
          tone={bar.tone}
          label={`${entry.label} ${bar.label}`}
          tooltip={bar.tooltip}
          size={size}
        />
      ))}
    </span>
  )
}

function UsageBarRow({ bar }: { bar: UsageBarView }) {
  return (
    <StatRow
      label={bar.label}
      value={`${bar.percent}%`}
      gauge={<Meter percent={bar.percent} tone={bar.tone} label={bar.label} size="fill" />}
      detail={bar.resetText ? `Resets ${bar.resetText}` : null}
    />
  )
}

function LogInButton({ profileId }: { profileId: string }) {
  const profile = useProfilesStore((s) => s.profiles.find((p) => p.id === profileId))
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const target = profile ? loginWorkspace(workspaces, profile) : undefined
  if (!profile) return null
  if (!target) return <PopoverNote>Add a workspace first: logging in opens a shell in one.</PopoverNote>
  return (
    <>
      <PopoverActions>
        <Button onClick={() => openShell(target, { env: profileEnv(profile) })} tooltip={`Open a shell as ${profile.name} in ${target.name}`}>
          <LogIn size={12} />
          Log in
        </Button>
      </PopoverActions>
      <PopoverNote>In the shell, run claude and then /login.</PopoverNote>
    </>
  )
}

function UsageSection({ entry }: { entry: UsageEntry }) {
  const refresh = useUsageStore((s) => s.refresh)
  if (entry.state === 'loading') return <PopoverNote>Loading usage data…</PopoverNote>
  if (entry.state === 'error') {
    return (
      <>
        <PopoverNote>Failed to load usage data</PopoverNote>
        <PopoverActions>
          <Button variant="secondary" onClick={() => refresh(entry.profileId)}>
            Retry
          </Button>
        </PopoverActions>
      </>
    )
  }
  if (entry.bars.length === 0) return <PopoverNote>Plan limits aren&apos;t available for this login method.</PopoverNote>
  return (
    <ul className="-mx-3">
      {entry.bars.map((bar) => (
        <UsageBarRow key={bar.key} bar={bar} />
      ))}
    </ul>
  )
}

/** The extension's Account & Usage dialog for one account profile. */
export function AccountUsagePanel({ entry, now }: { entry: UsageEntry; now: number }) {
  const refresh = useUsageStore((s) => s.refresh)
  const loggedOut = entry.state === 'not-logged-in'
  return (
    <>
      <PopoverHeading title="Account & Usage" hint={entry.profileName} />
      <PopoverSection>
        <SectionLabel as="h3">Account</SectionLabel>
        {loggedOut ? (
          <>
            <PopoverNote>Not logged in</PopoverNote>
            <LogInButton profileId={entry.profileId} />
          </>
        ) : (
          <>
            {entry.email && <DetailRow label="Email" value={entry.email} />}
            {entry.organization && <DetailRow label="Organization" value={entry.organization} />}
            {entry.plan && <DetailRow label="Plan" value={entry.plan} />}
          </>
        )}
      </PopoverSection>
      {!loggedOut && (
        <PopoverSection>
          <SectionLabel as="h3">Usage</SectionLabel>
          <UsageSection entry={entry} />
          {entry.error && entry.state === 'ready' && <PopoverNote>Last check failed: {entry.error}</PopoverNote>}
        </PopoverSection>
      )}
      <PopoverDivider />
      <PopoverSection>
        <div className="flex items-center justify-between gap-2">
          <PopoverNote>{entry.refreshing ? 'Refreshing…' : updatedText(entry.updatedAt, now)}</PopoverNote>
          <Button variant="ghost" onClick={() => refresh(entry.profileId)} tooltip="Fetch this profile's usage now">
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>
      </PopoverSection>
    </>
  )
}
