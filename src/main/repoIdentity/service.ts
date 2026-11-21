import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Workspace } from '../../shared/types'
import type {
  BuiltinIconChoice,
  ChooseImageResult,
  RepoIdentities,
  RepoIdentityViews
} from '../../shared/repoIdentity'
import { createRepoIdentityStore, shortHash } from './store'
import { chooseNotificationIcon } from './notificationIcon'
import { parseIcon } from './validate'

const PNG_DATA_URL = 'data:image/png;base64,'
const MAX_RENDERED_BYTES = 256 * 1024

function requireKey(repoGroupKey: unknown): string {
  if (typeof repoGroupKey !== 'string' || !repoGroupKey) throw new Error('repo group key must be a string')
  return repoGroupKey
}

/** Images enter only through importImage, never by a file name the renderer supplies. */
function requireBuiltinOrNone(icon: unknown): BuiltinIconChoice | undefined {
  if (icon === undefined || icon === null) return undefined
  const parsed = parseIcon(icon)
  if (parsed?.kind !== 'builtin') throw new Error('not a built-in repo icon')
  return parsed
}

export function createRepoIdentityService(dataDir: string, appIcon: string, listWorkspaces: () => Promise<Workspace[]>) {
  const store = createRepoIdentityStore(dataDir)
  const renderedDir = join(dataDir, 'repo-icons', 'notify')
  // Kept on disk, so notifications show the repo icon right after a restart, before the renderer redraws.
  const renderedPath = (repoGroupKey: string): string => join(renderedDir, `${shortHash(repoGroupKey)}.png`)

  const toViews = async (identities: RepoIdentities): Promise<RepoIdentityViews> => {
    const views: RepoIdentityViews = {}
    for (const [key, identity] of Object.entries(identities)) {
      views[key] = { ...identity }
      if (identity.icon?.kind !== 'image') continue
      const mime = identity.icon.file.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
      try {
        const bytes = await fs.readFile(store.imagePath(identity.icon.file))
        views[key].imageUrl = `data:${mime};base64,${bytes.toString('base64')}`
      } catch (err) {
        console.warn('[repo icons] missing image for', key, err)
      }
    }
    return views
  }

  return {
    list: async () => toViews(await store.list()),
    setDisplayName: async (repoGroupKey: unknown, name: unknown) =>
      toViews(await store.setDisplayName(requireKey(repoGroupKey), typeof name === 'string' ? name : '')),
    setIcon: async (repoGroupKey: unknown, icon: unknown) =>
      toViews(await store.setIcon(requireKey(repoGroupKey), requireBuiltinOrNone(icon))),
    importImage: async (repoGroupKey: unknown, sourcePath: string): Promise<ChooseImageResult> => {
      const result = await store.importImage(requireKey(repoGroupKey), sourcePath)
      return result.ok ? { ok: true, identities: await toViews(result.identities) } : result
    },
    /** The renderer draws each repo icon to a PNG, since Windows toasts can't show SVG or a React icon. */
    setRendered: async (repoGroupKey: unknown, dataUrl: unknown): Promise<void> => {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_DATA_URL)) return
      const bytes = Buffer.from(dataUrl.slice(PNG_DATA_URL.length), 'base64')
      if (bytes.length === 0 || bytes.length > MAX_RENDERED_BYTES) return
      await fs.mkdir(renderedDir, { recursive: true })
      await fs.writeFile(renderedPath(requireKey(repoGroupKey)), bytes)
    },
    notificationIcon: async (cwd: string): Promise<string> => {
      const [workspaces, identities] = await Promise.all([listWorkspaces(), store.list()])
      const choice = chooseNotificationIcon({
        cwd,
        workspaces,
        identities,
        hasRendered: (key) => existsSync(renderedPath(key)),
        imageExists: (file) => existsSync(store.imagePath(file))
      })
      if (choice.kind === 'image') return store.imagePath(choice.file)
      if (choice.kind === 'rendered') return renderedPath(choice.repoGroupKey)
      return appIcon
    }
  }
}

export type RepoIdentityService = ReturnType<typeof createRepoIdentityService>
