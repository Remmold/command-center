import type { ControlResult } from '../../../shared/types'

export const NOT_RUNNING = 'claude process is not running'

/**
 * Sends a control request. One refused only because the process was still being started is sent
 * again once that start finishes, so a change made during launch reaches the CLI.
 */
export async function controlOnceStarted(send: () => Promise<ControlResult>, starting: Promise<boolean> | null): Promise<ControlResult> {
  const first = await send()
  if (first.ok || first.error !== NOT_RUNNING || !starting) return first
  return (await starting) ? send() : first
}
