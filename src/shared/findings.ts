/** One thing a health check or a drift check reports about one context file (ADR 0005). */
export interface Finding {
  /** F1, F2… (drift) or H-… (health). */
  id: string
  /** Absolute path of the file it concerns. */
  path: string
  verdict: 'stale' | 'wrong' | 'duplicate' | 'structural'
  severity: 'problem' | 'note'
  claim: string
  evidence: string
  fix: string
  status: 'open' | 'applied' | 'skipped'
}
