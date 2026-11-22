import { basename, isAbsolute, relative } from 'node:path'
import { DEFAULT_PROFILE_ID } from '../../shared/types'
import { samePath } from './linker'
import type { VsCodeConfigDir } from './vscodeProfiles'

export interface SavedProfile {
  id: string
  name: string
  createdAt: number
  /** Set only for a folder the app adopted rather than made; that folder is never written to. */
  configDir?: string
}

export type PathKind = 'folder' | 'file' | 'missing'

interface UsedFolder {
  name: string
  configDir: string
}

function isInside(path: string, root: string): boolean {
  if (samePath(path, root)) return true
  const rel = relative(root.toLowerCase(), path.toLowerCase())
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function overlaps(a: string, b: string): boolean {
  return isInside(a, b) || isInside(b, a)
}

/** Why `path` cannot become a profile's folder, or null when it can. */
export function adoptionProblem(input: {
  path: string
  kind: PathKind
  used: readonly UsedFolder[]
  appProfilesRoot: string
}): string | null {
  const { path, kind, used, appProfilesRoot } = input
  if (!isAbsolute(path)) return 'Pick a full path.'
  const owner = used.find((u) => samePath(u.configDir, path))
  if (owner) return `${owner.name} already uses this folder.`
  if (overlaps(path, appProfilesRoot)) return 'That folder belongs to a profile the app made.'
  const overlapped = used.find((u) => overlaps(path, u.configDir))
  if (overlapped) return `That folder overlaps the folder of ${overlapped.name}.`
  if (kind === 'missing') return 'That folder does not exist.'
  if (kind === 'file') return 'That is a file, not a folder.'
  return null
}

/** VS Code's folders, once each, without those a profile already uses. */
export function suggestionsFrom(found: readonly VsCodeConfigDir[], used: readonly UsedFolder[]): VsCodeConfigDir[] {
  const out: VsCodeConfigDir[] = []
  for (const f of found) {
    if (used.some((u) => samePath(u.configDir, f.configDir))) continue
    if (out.some((o) => samePath(o.configDir, f.configDir))) continue
    out.push(f)
  }
  return out
}

export function adoptedName(path: string, found: readonly VsCodeConfigDir[]): string {
  const match = found.find((f) => samePath(f.configDir, path) && f.profileName !== 'Default')
  return match?.profileName ?? basename(path.replace(/[\\/]+$/, ''))
}

/** Shared-item links go only into folders the app made; Default is their source. */
export function linksAllowed(profile: { id: string; adopted: boolean }): boolean {
  return profile.id !== DEFAULT_PROFILE_ID && !profile.adopted
}

/** Only forgets the profile; no folder is deleted, whether the app made it or not. */
export function removeSaved(saved: readonly SavedProfile[], id: string): SavedProfile[] {
  return saved.filter((p) => p.id !== id)
}
