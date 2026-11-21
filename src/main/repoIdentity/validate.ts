import {
  isBuiltinIconName,
  isRepoAccent,
  type RepoIconChoice,
  type RepoIdentities,
  type RepoIdentity
} from '../../shared/repoIdentity'

/** A content hash plus extension, so a stored name can never point outside the icons folder. */
export const IMAGE_FILE_NAME = /^[0-9a-f]{16,64}\.(png|svg)$/

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}

function parseIcon(x: unknown): RepoIconChoice | undefined {
  if (!isRecord(x)) return undefined
  if (x.kind === 'builtin' && isBuiltinIconName(x.name) && isRepoAccent(x.accent)) {
    return { kind: 'builtin', name: x.name, accent: x.accent }
  }
  if (x.kind === 'image' && typeof x.file === 'string' && IMAGE_FILE_NAME.test(x.file)) {
    return { kind: 'image', file: x.file }
  }
  return undefined
}

function parseIdentity(x: unknown): RepoIdentity | undefined {
  if (!isRecord(x)) return undefined
  const displayName = typeof x.displayName === 'string' && x.displayName.trim() ? x.displayName.trim() : undefined
  const icon = parseIcon(x.icon)
  if (displayName === undefined && icon === undefined) return undefined
  return { ...(displayName && { displayName }), ...(icon && { icon }) }
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
