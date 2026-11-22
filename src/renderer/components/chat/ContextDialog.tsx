import { useEffect, useState } from 'react'
import { Dialog } from '../ui/Dialog'
import { formatTokens, homePath, parseContextUsage, shareText, type ContextUsage } from './contextUsage'

const SWATCHES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-6', 'bg-chart-7', 'bg-chart-8']
const swatch = (index: number): string => SWATCHES[index % SWATCHES.length]

interface Props {
  paneId: string
  onClose: () => void
}

/** The extension's "Context usage" dialog, filled from `get_context_usage`. */
export function ContextDialog({ paneId, onClose }: Props) {
  const [usage, setUsage] = useState<ContextUsage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.claude.control(paneId, 'get_context_usage').then((res) => {
      if (cancelled) return
      if (!res.ok) return setError(res.error)
      const parsed = parseContextUsage(res.response)
      if (parsed) setUsage(parsed)
      else setError('the reply had no token counts')
    })
    return () => {
      cancelled = true
    }
  }, [paneId])

  return (
    <Dialog title="Context usage" onClose={onClose}>
      {error ? (
        <Message>Failed to load context usage: {error}</Message>
      ) : !usage ? (
        <Message>Loading context usage…</Message>
      ) : (
        <ContextBreakdown usage={usage} />
      )}
    </Dialog>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-muted">{children}</p>
}

function ContextBreakdown({ usage }: { usage: ContextUsage }) {
  const shown = usage.categories.filter((c) => c.tokens > 0 && !c.isDeferred)
  const used = shown.filter((c) => c.name !== 'Free space')
  const memory = [...usage.memoryFiles].sort((a, b) => b.tokens - a.tokens).slice(0, 5)
  const agents = [...usage.agents].sort((a, b) => b.tokens - a.tokens).slice(0, 5)
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <div className="flex select-text flex-col gap-0.5 text-sm tabular-nums">
          <div>{usage.model}</div>
          <div>
            {formatTokens(usage.totalTokens)} / {formatTokens(usage.rawMaxTokens)} tokens ({usage.percentage}%)
          </div>
        </div>
        <div className="flex h-2 overflow-hidden rounded bg-strong" aria-hidden="true">
          {used.map((c) => (
            <div
              key={c.name}
              className={`h-full ${swatch(shown.indexOf(c))}`}
              style={{ width: `${(c.tokens / usage.rawMaxTokens) * 100}%` }}
              title={`${c.name}: ${formatTokens(c.tokens)}`}
            />
          ))}
        </div>
      </section>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-strong text-[11px] font-semibold uppercase tracking-wide text-muted">
            <th className="w-4 pb-1" />
            <th className="pb-1 text-left font-semibold">Category</th>
            <th className="pb-1 text-right font-semibold">Tokens</th>
            <th className="w-14 pb-1 text-right font-semibold">Usage</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c, i) => (
            <tr key={c.name}>
              <td className="py-0.5">
                <span className={`block h-2.5 w-2.5 rounded-sm ${c.name === 'Free space' ? '' : swatch(i)}`} />
              </td>
              <td className="py-0.5">{c.name}</td>
              <td className="py-0.5 text-right tabular-nums text-muted">{formatTokens(c.tokens)}</td>
              <td className="py-0.5 text-right text-xs tabular-nums text-faint">{shareText(c.tokens, usage.rawMaxTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {memory.length > 0 && (
        <DetailList title="Memory files" hint="/memory" rows={memory.map((m) => ({ name: homePath(m.path), tokens: m.tokens }))} />
      )}
      {agents.length > 0 && (
        <DetailList title="Custom agents" hint="/agents" rows={agents.map((a) => ({ name: a.agentType, tokens: a.tokens }))} />
      )}
    </div>
  )
}

function DetailList({ title, hint, rows }: { title: string; hint: string; rows: { name: string; tokens: number }[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-baseline gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-muted">{title}</span>
        <span className="font-mono text-faint">{hint}</span>
      </h3>
      <ul className="flex flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-baseline justify-between gap-3 pl-3 text-xs">
            <span className="flex-1 select-text break-all text-fg" title={r.name}>
              {r.name}
            </span>
            <span className="tabular-nums text-faint">{formatTokens(r.tokens)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
