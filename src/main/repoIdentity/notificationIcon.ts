import type { Workspace } from '../../shared/types'
import type { RepoIdentities } from '../../shared/repoIdentity'
import { workspaceAt } from '../attention/attention'

export type NotificationIconChoice =
  | { kind: 'image'; file: string }
  /** The PNG the renderer drew for this repo group. */
  | { kind: 'rendered'; repoGroupKey: string }
  | { kind: 'app' }

interface Input {
  cwd: string
  workspaces: readonly Pick<Workspace, 'path' | 'repoGroupKey'>[]
  identities: RepoIdentities
  hasRendered: (repoGroupKey: string) => boolean
  imageExists: (file: string) => boolean
}

/** Windows toasts take PNG but not SVG, so everything except a custom or found PNG goes through the drawn picture. */
export function chooseNotificationIcon({ cwd, workspaces, identities, hasRendered, imageExists }: Input): NotificationIconChoice {
  const workspace = workspaceAt(cwd, workspaces)
  if (!workspace) return { kind: 'app' }
  const identity = identities[workspace.repoGroupKey]
  const file = identity?.icon ? (identity.icon.kind === 'image' ? identity.icon.file : undefined) : identity?.found?.[0]?.file
  if (file?.endsWith('.png') && imageExists(file)) return { kind: 'image', file }
  if (hasRendered(workspace.repoGroupKey)) return { kind: 'rendered', repoGroupKey: workspace.repoGroupKey }
  return { kind: 'app' }
}
