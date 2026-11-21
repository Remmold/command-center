import { promises as fs } from 'node:fs'
import { join } from 'node:path'

type HookEntry = { hooks?: Array<{ command?: unknown }> }

const isLegacyEntry = (entry: HookEntry): boolean =>
  (entry.hooks ?? []).some((h) => typeof h.command === 'string' && h.command.includes('permission-hook'))

/**
 * Removes the hook older versions wrote into a repo's `.claude/settings.local.json`.
 * Leaves the file alone when it has no such hook or can't be parsed. Returns whether it changed.
 */
export async function removeLegacyHook(repoPath: string): Promise<boolean> {
  const path = join(repoPath, '.claude', 'settings.local.json')
  let settings: Record<string, unknown>
  try {
    settings = JSON.parse(await fs.readFile(path, 'utf-8'))
  } catch {
    return false
  }
  const hooks = settings.hooks as Record<string, HookEntry[]> | undefined
  const preToolUse = hooks?.PreToolUse
  if (!hooks || !Array.isArray(preToolUse) || !preToolUse.some(isLegacyEntry)) return false

  const kept = preToolUse.filter((entry) => !isLegacyEntry(entry))
  const nextHooks: Record<string, HookEntry[]> = { ...hooks, PreToolUse: kept }
  if (kept.length === 0) delete nextHooks.PreToolUse
  const next: Record<string, unknown> = { ...settings, hooks: nextHooks }
  if (Object.keys(nextHooks).length === 0) delete next.hooks
  await fs.writeFile(path, JSON.stringify(next, null, 2), 'utf-8')
  return true
}
