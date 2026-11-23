export const OBSERVED_REFRESH_MS = 10_000

/** How often VS Code's sessions, and the account of the one on screen, are read again; only runs on the fake CLI (`CC_CLAUDE_BIN`) may shorten it. */
export function observedRefreshMs(env: Record<string, string | undefined>): number {
  if (!env.CC_CLAUDE_BIN) return OBSERVED_REFRESH_MS
  const ms = Number(env.CC_OBSERVED_REFRESH_MS)
  return env.CC_OBSERVED_REFRESH_MS && Number.isFinite(ms) && ms > 0 ? ms : OBSERVED_REFRESH_MS
}
