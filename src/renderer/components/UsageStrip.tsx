import { useEffect, useMemo } from 'react'
import { useMinuteClock } from '../hooks/useMinuteClock'
import { formatResetTime, formatTokens, totalTokens, useUsageStore } from '../state/usageStore'
import { buildUsageStrip, type UsageBar } from '../state/usageModel'
import { useProfilesStore } from '../state/profilesStore'
import { useWorkspacesStore } from '../state/workspacesStore'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { useViewStore } from '../state/viewStore'
import { Meter } from './ui/Meter'

function useProfileOnScreen(): string | null {
  const view = useViewStore((s) => s.view)
  const activeProjectId = useProjectViewsStore((s) => s.activeProjectId)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  if (view !== 'work' || !activeProjectId) return null
  return workspaces.find((w) => w.id === activeProjectId)?.profileId ?? null
}

/** One rate-limit bar per account profile; the profile of the workspace on screen is highlighted. */
export function UsageStrip() {
  const profiles = useProfilesStore((s) => s.profiles)
  const loadProfiles = useProfilesStore((s) => s.load)
  const sessions = useUsageStore((s) => s.sessions)
  const tallies = useUsageStore((s) => s.profiles)
  const rateLimits = useUsageStore((s) => s.rateLimits)
  const activeProfileId = useProfileOnScreen()
  const now = useMinuteClock()

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  const bars = useMemo(
    () =>
      buildUsageStrip({
        profiles,
        tallies: { sessions, profiles: tallies },
        rateLimits,
        activeProfileId,
        now
      }),
    [profiles, sessions, tallies, rateLimits, activeProfileId, now]
  )

  if (bars.length === 0) return null
  return (
    <ul aria-label="usage per account profile" className="flex h-full shrink-0 items-center gap-1 border-l border-subtle px-2">
      {bars.map((bar) => (
        <UsageStripItem key={bar.profileId} bar={bar} />
      ))}
    </ul>
  )
}

function UsageStripItem({ bar }: { bar: UsageBar }) {
  const w = bar.window
  const reading = w?.percent != null ? `${w.percent}%` : (w?.label ?? '—')
  const fill = w?.percent ?? (w?.tone === 'limit' ? 100 : null)
  return (
    <li
      aria-current={bar.highlighted || undefined}
      title={describe(bar)}
      className={
        'flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] ' +
        (bar.highlighted ? 'bg-list-selected text-fg' : 'text-muted')
      }
    >
      <span className="max-w-[6rem] truncate">{bar.name}</span>
      <Meter
        percent={fill}
        tone={w?.tone ?? 'ok'}
        label={`${bar.name} rate-limit window`}
      />
      <span className="tabular-nums">{reading}</span>
      {w?.usingOverage && <span className="text-meter-warn" title="using overage" aria-label="using overage">+</span>}
    </li>
  )
}

function describe(bar: UsageBar): string {
  const lines = [bar.name]
  const w = bar.window
  if (!w) lines.push('rate limit: no reading yet')
  else {
    const fill = w.percent != null ? `${w.percent}% used` : w.tone === 'limit' ? 'limit reached' : 'no reading'
    lines.push(`${w.label} window: ${fill}${w.resetsAt ? ` · resets in ${formatResetTime(w.resetsAt)}` : ''}`)
    if (w.usingOverage) lines.push('using overage')
  }
  const models = Object.entries(bar.tokensByModel)
    .map(([model, t]) => ({ model, total: totalTokens(t) }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total)
  if (models.length > 0) {
    lines.push('today: ' + models.map((m) => `${shortModel(m.model)} ${formatTokens(m.total)}`).join(', '))
    lines.push(`≈ $${bar.todayCostUsd.toFixed(2)} api-equiv`)
  }
  return lines.join('\n')
}

function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}.*$/, '')
}
