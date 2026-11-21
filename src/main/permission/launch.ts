import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export interface PermissionLaunch {
  cliMode: string | undefined
  useHook: boolean
  env: Record<string, string>
}

const HOOK_MODES = new Set(['ask', 'acceptEdits'])

/**
 * How a hosted session's permissions are wired. "ask" turns the CLI's own prompts off and
 * relies on the app's hook, so without a running approval server it falls back to the CLI's
 * default prompts rather than running ungated.
 */
export function permissionLaunch(mode: string | undefined, serverPort: number | null, paneId: string): PermissionLaunch {
  const useHook = mode !== undefined && HOOK_MODES.has(mode) && serverPort !== null
  if (!useHook) return { cliMode: mode === 'ask' ? 'default' : mode, useHook: false, env: {} }
  return {
    cliMode: mode === 'ask' ? 'bypassPermissions' : mode,
    useHook: true,
    env: { CC_PERMISSION_PORT: String(serverPort), CC_PANE_ID: paneId, CC_PERMISSION_MODE: mode as string }
  }
}

/** Settings passed with `--settings`, so the hook lives only in the app's sessions, never in a repo. */
export function hookSettings(hookCommand: string): Record<string, unknown> {
  return { hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: hookCommand }] }] } }
}

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
