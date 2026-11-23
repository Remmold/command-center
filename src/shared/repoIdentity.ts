import { repoGroupHue } from './repoGroups'

export const BUILTIN_ICON_NAMES = [
  'rocket',
  'gamepad-2',
  'code',
  'terminal',
  'database',
  'server',
  'cloud',
  'globe',
  'bot',
  'brain',
  'cpu',
  'wrench',
  'hammer',
  'package',
  'boxes',
  'layers',
  'puzzle',
  'zap',
  'flame',
  'leaf',
  'tree-pine',
  'mountain',
  'sun',
  'moon',
  'star',
  'heart',
  'shield',
  'key',
  'message-square',
  'music',
  'image',
  'book-open',
  'graduation-cap',
  'shopping-cart',
  'chart-bar',
  'swords',
  'map',
  'compass',
  'flask-conical',
  'palette'
] as const

export type BuiltinIconName = (typeof BUILTIN_ICON_NAMES)[number]

export const REPO_ACCENTS = {
  red: '#dc2626',
  orange: '#ea580c',
  amber: '#d97706',
  lime: '#65a30d',
  green: '#16a34a',
  teal: '#0d9488',
  sky: '#0284c7',
  blue: '#2563eb',
  violet: '#7c3aed',
  pink: '#db2777',
  slate: '#475569'
} as const

export type RepoAccent = keyof typeof REPO_ACCENTS

export function isBuiltinIconName(x: unknown): x is BuiltinIconName {
  return (BUILTIN_ICON_NAMES as readonly unknown[]).includes(x)
}

export function isRepoAccent(x: unknown): x is RepoAccent {
  return typeof x === 'string' && Object.hasOwn(REPO_ACCENTS, x)
}

export type RepoIconChoice =
  | { kind: 'builtin'; name: BuiltinIconName; accent: RepoAccent }
  /** `file` is a name inside the app's repo-icons folder. */
  | { kind: 'image'; file: string }
  /** The letter on purpose, so no found icon takes its place. */
  | { kind: 'letter' }

export type FoundIconSource = 'file' | 'unity' | 'godot' | 'exe'

/** An icon found in the repo, copied into the repo-icons folder. */
export interface FoundIcon {
  file: string
  /** Where it was found, relative to the repo root. */
  path: string
  source: FoundIconSource
}

export interface RepoIdentity {
  displayName?: string
  /** The user's own choice; without one the first found icon shows. */
  icon?: RepoIconChoice
  /** Best first; absent until the repo was searched, empty when nothing was found. */
  found?: FoundIcon[]
}

/** Keyed by repo group key. */
export type RepoIdentities = Record<string, RepoIdentity>

/** What the renderer gets: a custom image arrives as a data URL, since the page can't read userData files. */
export interface FoundIconView extends FoundIcon {
  url: string
}

export interface RepoIdentityView extends Omit<RepoIdentity, 'found'> {
  imageUrl?: string
  /** Only the found icons whose copy could be read. */
  found?: FoundIconView[]
}

export type RepoIdentityViews = Record<string, RepoIdentityView>

export const MAX_REPO_IMAGE_BYTES = 1024 * 1024
export const MAX_REPO_IMAGE_LABEL = '1 MB'

export type ImageImportResult<T> = { ok: true; identities: T } | { ok: false; error: string }

export type ChooseImageResult = ImageImportResult<RepoIdentityViews>

export function letterColor(hue: number): string {
  return `hsl(${hue}, 55%, 40%)`
}

export type BuiltinIconChoice = Extract<RepoIconChoice, { kind: 'builtin' }>

/** What the renderer may ask for; undefined goes back to the automatic icon. */
export type RepoIconRequest = BuiltinIconChoice | { kind: 'letter' } | { kind: 'found'; file: string } | undefined

export type IconOrigin = 'picked' | 'automatic' | 'letter'

export function iconOrigin(identity: RepoIdentityView | undefined): IconOrigin {
  const icon = identity?.icon
  if (icon?.kind === 'builtin' || (icon?.kind === 'image' && identity?.imageUrl)) return 'picked'
  if (!icon && identity?.found?.length) return 'automatic'
  return 'letter'
}

export type RepoIconSpec =
  | { kind: 'letter'; letter: string; hue: number }
  | { kind: 'builtin'; name: BuiltinIconName; color: string }
  | { kind: 'image'; src: string }

export interface RepoIconInput {
  repoGroupKey: string
  repoName: string
  identity?: RepoIdentityView
}

export function repoDisplayName(repoName: string, identity: RepoIdentity | undefined): string {
  return identity?.displayName?.trim() || repoName
}

export function resolveRepoIcon({ repoGroupKey, repoName, identity }: RepoIconInput): RepoIconSpec {
  const icon = identity?.icon
  if (icon?.kind === 'builtin') return { kind: 'builtin', name: icon.name, color: REPO_ACCENTS[icon.accent] }
  if (icon?.kind === 'image' && identity?.imageUrl) return { kind: 'image', src: identity.imageUrl }
  const automatic = icon ? undefined : identity?.found?.[0]
  if (automatic) return { kind: 'image', src: automatic.url }
  const letter = repoDisplayName(repoName, identity).trim().charAt(0).toUpperCase() || '?'
  return { kind: 'letter', letter, hue: repoGroupHue(repoGroupKey) }
}
