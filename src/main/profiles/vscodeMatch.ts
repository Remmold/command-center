import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { UseVsCodeAccountsResult, VsCodeMatch } from '../../shared/types'
import { accountMoves, preselectedProfile, sameDir } from '../../shared/vscodeMatch'
import { userDataPath } from '../util/paths'
import * as workspaces from '../workspaces/store'
import * as profiles from './store'

interface SavedMatch {
  dismissed: string[]
  noticeDismissed: boolean
}

function matchFile(): string {
  return userDataPath('vscode-match.json')
}

async function readSaved(): Promise<SavedMatch> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(matchFile(), 'utf-8'))
    const p = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
    return {
      dismissed: Array.isArray(p.dismissed) ? p.dismissed.filter((k): k is string => typeof k === 'string') : [],
      noticeDismissed: p.noticeDismissed === true
    }
  } catch {
    return { dismissed: [], noticeDismissed: false }
  }
}

let queue: Promise<unknown> = Promise.resolve()

function update(change: (saved: SavedMatch) => SavedMatch): Promise<void> {
  const next = queue.then(async () => {
    const file = matchFile()
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.writeFile(`${file}.tmp`, JSON.stringify(change(await readSaved()), null, 2), 'utf-8')
    await fs.rename(`${file}.tmp`, file)
  })
  queue = next.catch(() => undefined)
  return next
}

export async function current(): Promise<VsCodeMatch> {
  const [folders, saved] = await Promise.all([profiles.vscodeFolderAccounts(), readSaved()])
  return { folders, ...saved }
}

export function dismiss(keys: readonly string[]): Promise<void> {
  return update((s) => ({ ...s, dismissed: [...new Set([...s.dismissed, ...keys])] }))
}

export function dismissNotice(): Promise<void> {
  return update((s) => ({ ...s, noticeDismissed: true }))
}

/**
 * Moves the named workspaces onto the account VS Code uses for them, adopting each Claude folder
 * no account uses yet. Main re-reads VS Code, so only real mismatches move.
 */
export async function useVsCodeAccounts(workspaceIds: readonly string[]): Promise<UseVsCodeAccountsResult> {
  const folders = await profiles.vscodeFolderAccounts()
  const all = await workspaces.list()
  const moves = accountMoves({
    workspaces: all.filter((w) => workspaceIds.includes(w.id)),
    profiles: await profiles.list(),
    folders,
    dismissed: []
  })
  const accountNames: string[] = []
  for (const move of moves) {
    let account = (await profiles.list()).find((p) => sameDir(p.configDir, move.configDir))
    if (!account) {
      const adopted = await profiles.adopt(move.configDir, move.profileName === 'Default' ? undefined : move.profileName)
      if (!adopted.ok) return { ok: false, error: adopted.error }
      account = adopted.profile
    }
    await workspaces.setProfile(move.workspaceId, account.id)
    if (!accountNames.includes(account.name)) accountNames.push(account.name)
  }
  return { ok: true, accountNames }
}

/** The account a new workspace at `path` starts on, when VS Code ties that folder to one. */
export async function profileForNewWorkspace(path: string): Promise<string | undefined> {
  return preselectedProfile(path, await profiles.vscodeFolderAccounts(), await profiles.list())
}
