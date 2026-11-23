import type { ChatItem } from '../../../shared/chatItems'

/**
 * The CLI's `total_cost_usd` is a running total for the chat's process, not the cost of one turn, so
 * only the latest result carries the session's figure. It is an estimate at API prices; subscription
 * plans are not billed per token.
 */
export function sessionCostEstimate(items: readonly ChatItem[]): number | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind === 'result' && item.costUsd !== undefined) return item.costUsd
  }
  return undefined
}

export function formatCostEstimate(usd: number): string {
  return usd < 0.01 ? '< $0.01' : `$${usd.toFixed(2)}`
}
