import { DEFAULT_PROFILE_ID, type VsCodeFolderAccount } from './types'

/** Windows paths compared as Windows compares them: any case, either slash, no trailing slash. */
export function sameDir(a: string, b: string): boolean {
  return normDir(a) === normDir(b)
}

function normDir(p: string): string {
  return p.replace(/^\\\\\?\\/, '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

interface MatchWorkspace {
  id: string
  name: string
  path: string
  profileId: string
}

interface MatchProfile {
  id: string
  configDir: string
}

/** One workspace VS Code runs on a different Claude folder than the app does. */
export interface AccountMove {
  /** Names this mismatch for Dismiss; a new mismatch has a new key. */
  key: string
  workspaceId: string
  workspaceName: string
  profileName: string
  configDir: string
}

/** Only an exact match counts: a folder inside an associated folder does not inherit its profile. */
export function vscodeFolderFor(path: string, folders: readonly VsCodeFolderAccount[]): VsCodeFolderAccount | undefined {
  return folders.find((f) => sameDir(f.folder, path))
}

function profileOf(profiles: readonly MatchProfile[], id: string): MatchProfile | undefined {
  return profiles.find((p) => p.id === id) ?? profiles.find((p) => p.id === DEFAULT_PROFILE_ID)
}

export function accountMoves(input: {
  workspaces: readonly MatchWorkspace[]
  profiles: readonly MatchProfile[]
  folders: readonly VsCodeFolderAccount[]
  dismissed: readonly string[]
}): AccountMove[] {
  const moves: AccountMove[] = []
  for (const w of input.workspaces) {
    const vscode = vscodeFolderFor(w.path, input.folders)
    const current = profileOf(input.profiles, w.profileId)
    if (!vscode || !current || sameDir(current.configDir, vscode.configDir)) continue
    const key = `${w.id}>${normDir(vscode.configDir)}`
    if (input.dismissed.includes(key)) continue
    moves.push({ key, workspaceId: w.id, workspaceName: w.name, profileName: vscode.profileName, configDir: vscode.configDir })
  }
  return moves
}

export interface AccountMoveGroup {
  profileName: string
  workspaceNames: string[]
}

export function movesByAccount(moves: readonly AccountMove[]): AccountMoveGroup[] {
  const groups: AccountMoveGroup[] = []
  for (const m of moves) {
    const group = groups.find((g) => g.profileName === m.profileName)
    if (group) group.workspaceNames.push(m.workspaceName)
    else groups.push({ profileName: m.profileName, workspaceNames: [m.workspaceName] })
  }
  return groups
}

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The account a new workspace starts on: the one using the Claude folder VS Code uses for that folder. */
export function preselectedProfile(
  path: string,
  folders: readonly VsCodeFolderAccount[],
  profiles: readonly MatchProfile[]
): string | undefined {
  const vscode = vscodeFolderFor(path, folders)
  return vscode && profiles.find((p) => sameDir(p.configDir, vscode.configDir))?.id
}
