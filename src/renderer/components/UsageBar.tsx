import {
  formatResetTime,
  formatTokens,
  totalTokens,
  useUsageStore
} from '../state/usageStore'
import { useProjectViewsStore } from '../state/projectViewsStore'

export function UsageBar() {
  const tokensByModel = useUsageStore((s) => s.tokensByModel)
  const sessions = useUsageStore((s) => s.sessions)
  const rateLimit = useUsageStore((s) => s.rateLimit)
  const todayCost = useUsageStore((s) => s.todayCostUsd)

  const views = useProjectViewsStore((s) => s.views)
  const activeProjectId = useProjectViewsStore((s) => s.activeProjectId)
  const activeView = activeProjectId ? views[activeProjectId] : null
  const activeSessionId = activeView?.activeClaudeSessionId
  const activeSessionUsage = activeSessionId ? sessions[activeSessionId] : undefined

  const modelEntries = Object.entries(tokensByModel)
    .map(([model, t]) => ({ model, total: totalTokens(t) }))
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total)

  return (
    <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] text-zinc-500">
      <div className="flex min-w-0 items-center gap-4 overflow-x-auto">
        <RateLimitBadge rateLimit={rateLimit} />
        {modelEntries.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-600">today:</span>
            {modelEntries.map(({ model, total }) => (
              <span key={model} className="text-zinc-300">
                <span className="text-zinc-500">{shortModel(model)}</span> {formatTokens(total)}
              </span>
            ))}
          </div>
        )}
        {activeSessionUsage && activeSessionUsage.turns > 0 && (
          <span>
            <span className="text-zinc-600">session:</span>{' '}
            <span className="text-zinc-300">{activeSessionUsage.turns} turn(s)</span>
          </span>
        )}
      </div>
      <div
        className="text-zinc-700"
        title={`equivalent api cost (today): $${todayCost.toFixed(4)} — informational only when on subscription`}
      >
        ≈ ${todayCost.toFixed(2)} api-equiv
      </div>
    </footer>
  )
}

function RateLimitBadge({ rateLimit }: { rateLimit: ReturnType<typeof useUsageStore.getState>['rateLimit'] }) {
  if (!rateLimit) {
    return <span className="text-zinc-600">rate limit: —</span>
  }
  const status = rateLimit.status.toLowerCase()
  const color =
    status === 'blocked' || status === 'denied'
      ? 'text-red-400'
      : status.includes('warn')
        ? 'text-amber-400'
        : 'text-emerald-400'
  const label = rateLimit.rateLimitType === 'five_hour' ? '5h window' : rateLimit.rateLimitType
  const resetIn = formatResetTime(rateLimit.resetsAt)
  return (
    <span>
      <span className="text-zinc-600">{label}:</span>{' '}
      <span className={color}>{rateLimit.status}</span>
      <span className="text-zinc-600"> · resets in {resetIn}</span>
      {rateLimit.isUsingOverage && <span className="ml-1 text-amber-400">(overage)</span>}
    </span>
  )
}

function shortModel(model: string): string {
  // claude-opus-4-7[1m] -> opus-4-7[1m]
  // claude-sonnet-4-6 -> sonnet-4-6
  // claude-haiku-4-5-20251001 -> haiku-4-5
  const m = model.replace(/^claude-/, '')
  return m.replace(/-\d{8}.*$/, '')
}
