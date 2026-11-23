import {
  isBuiltinIconName,
  isRepoAccent,
  type FoundIcon,
  type FoundIconSource,
  type RepoIconChoice,
  type RepoIdentities,
  type RepoIdentity
} from '../../shared/repoIdentity'

/** A content hash plus extension, so a stored name can never point outside the icons folder. */
export const IMAGE_FILE_NAME = /^[0-9a-f]{16,64}\.(png|svg)$/

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}

export function parseIcon(x: unknown): RepoIconChoice | undefined {
  if (!isRecord(x)) return undefined
  if (x.kind === 'builtin' && isBuiltinIconName(x.name) && isRepoAccent(x.accent)) {
    return { kind: 'builtin', name: x.name, accent: x.accent }
  }
  if (x.kind === 'image' && typeof x.file === 'string' && IMAGE_FILE_NAME.test(x.file)) {
    return { kind: 'image', file: x.file }
  }
  if (x.kind === 'letter') return { kind: 'letter' }
  return undefined
}

const FOUND_SOURCES: readonly FoundIconSource[] = ['file', 'unity', 'godot', 'exe']

function parseFound(x: unknown): FoundIcon[] | undefined {
  if (!Array.isArray(x)) return undefined
  return x.flatMap((f): FoundIcon[] =>
    isRecord(f) &&
    typeof f.file === 'string' &&
    IMAGE_FILE_NAME.test(f.file) &&
    typeof f.path === 'string' &&
    FOUND_SOURCES.includes(f.source as FoundIconSource)
      ? [{ file: f.file, path: f.path, source: f.source as FoundIconSource }]
      : []
  )
}

function parseIdentity(x: unknown): RepoIdentity | undefined {
  if (!isRecord(x)) return undefined
  const displayName = typeof x.displayName === 'string' && x.displayName.trim() ? x.displayName.trim() : undefined
  const icon = parseIcon(x.icon)
  const found = parseFound(x.found)
  const searchVersion = found && Number.isInteger(x.searchVersion) ? (x.searchVersion as number) : undefined
  if (displayName === undefined && icon === undefined && found === undefined) return undefined
  return {
    ...(displayName && { displayName }),
    ...(icon && { icon }),
    ...(found && { found }),
    ...(searchVersion !== undefined && { searchVersion })
  }
}

/** Drops anything malformed, so a hand-edited or older file never breaks the app. */
export function parseRepoIdentities(raw: unknown): RepoIdentities {
  if (!isRecord(raw)) return {}
  const out: RepoIdentities = {}
  for (const [key, value] of Object.entries(raw)) {
    const identity = parseIdentity(value)
    if (identity) out[key] = identity
  }
  return out
}
