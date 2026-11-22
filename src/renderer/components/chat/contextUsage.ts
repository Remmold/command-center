/** What the app keeps from the CLI's `get_context_usage` reply. */
export interface ContextUsage {
  model: string
  totalTokens: number
  rawMaxTokens: number
  percentage: number
  /** Tokens at which the CLI compacts on its own; the extension's context window minus its reserves. */
  autoCompactThreshold?: number
  categories: { name: string; tokens: number; isDeferred: boolean }[]
  memoryFiles: { path: string; tokens: number }[]
  agents: { agentType: string; tokens: number }[]
}

type Raw = Record<string, unknown>
const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const records = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter(isRecord) : [])

export function parseContextUsage(raw: Raw): ContextUsage | null {
  const totalTokens = num(raw.totalTokens)
  const rawMaxTokens = num(raw.rawMaxTokens) ?? num(raw.maxTokens)
  if (totalTokens === undefined || rawMaxTokens === undefined) return null
  return {
    model: str(raw.model),
    totalTokens,
    rawMaxTokens,
    percentage: num(raw.percentage) ?? 0,
    autoCompactThreshold: num(raw.autoCompactThreshold),
    categories: records(raw.categories).map((c) => ({ name: str(c.name), tokens: num(c.tokens) ?? 0, isDeferred: c.isDeferred === true })),
    memoryFiles: records(raw.memoryFiles).map((m) => ({ path: str(m.path), tokens: num(m.tokens) ?? 0 })),
    agents: records(raw.agents).map((a) => ({ agentType: str(a.agentType), tokens: num(a.tokens) ?? 0 }))
  }
}

/** The extension's `contextUsageThreshold` default. */
export const CONTEXT_THRESHOLD = 50

export interface ContextIndicator {
  usedPercent: number
  label: string
  tooltip: string
  hint: string
}

/** The footer pie (the extension's `jBt`): hidden until more than `threshold`% of the space before auto-compact is used. */
export function contextIndicator(
  usage: Pick<ContextUsage, 'totalTokens' | 'rawMaxTokens' | 'autoCompactThreshold'>,
  threshold = CONTEXT_THRESHOLD
): ContextIndicator | null {
  const space = usage.autoCompactThreshold || usage.rawMaxTokens
  if (!space) return null
  const used = Math.min((usage.totalTokens / space) * 100, 100)
  if (used <= threshold) return null
  return {
    usedPercent: used,
    label: `${Math.round(used)}% context used — click to compact`,
    tooltip: `${Math.round(100 - used)}% of context remaining until auto-compact.`,
    hint: 'Click to compact now.'
  }
}

/** Which of the extension's drawn pies (`Vzn`) a percentage above 50 uses. */
export function pieBucket(percent: number): 50 | 75 | 99 {
  if (percent < 62.5) return 50
  if (percent < 87) return 75
  return 99
}

/** The extension's `lv`. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return tokens.toString()
}

/** The extension's `SDn`. */
export function shareText(tokens: number, max: number): string {
  const share = (tokens / max) * 100
  return share < 0.1 ? '<0.1%' : `${share.toFixed(1)}%`
}

/** The extension's `CDn`: a path under the user's home folder starts with `~`. */
export function homePath(path: string): string {
  const home = path.match(/^(\/Users\/[^/]+|\/home\/[^/]+|\/root|[A-Za-z]:[\\/]Users[\\/][^\\/]+)/)
  return home ? '~' + path.slice(home[0].length) : path
}
