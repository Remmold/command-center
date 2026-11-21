import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Workspace } from '../../shared/types'
import type { ChooseImageResult, RepoIconChoice, RepoIdentities, RepoIdentityView } from '../../shared/repoIdentity'
import { createRepoIdentityStore, type ImportImageResult } from './store'
import { chooseNotificationIcon } from './notificationIcon'
import { parseRepoIdentities } from './validate'

const PNG_DATA_URL = 'data:image/png;base64,'
const MAX_RENDERED_BYTES = 256 * 1024

/** Accepts only a built-in choice or none: images enter through importImage, never by a renderer-supplied file name. */
function builtinOrNone(icon: unknown): RepoIconChoice | undefined | null {
  if (icon === undefined || icon === null) return undefined
  const parsed = parseRepoIdentities({ k: { icon } }).k?.icon
  return parsed?.kind === 'builtin' ? parsed : null
}

export function createRepoIdentityService(dataDir: string, appIcon: string, listWorkspaces: () => Promise<Workspace[]>) {
  const store = createRepoIdentityStore(dataDir)
  const renderedDir = join(dataDir, 'repo-icons', 'notify')
  const rendered = new Map<string, string>()

  const toViews = async (identities: RepoIdentities): Promise<Record<string, RepoIdentityView>> => {
    const views: Record<string, RepoIdentityView> = {}
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
    setDisplayName: async (repoGroupKey: string, name: string) =>
      toViews(await store.setDisplayName(repoGroupKey, String(name ?? ''))),
    setIcon: async (repoGroupKey: string, icon: unknown) => {
      const choice = builtinOrNone(icon)
      if (choice === null) throw new Error('not a built-in repo icon')
      return toViews(await store.setIcon(repoGroupKey, choice))
    },
    importImage: async (repoGroupKey: string, sourcePath: string): Promise<ChooseImageResult> => {
      const result: ImportImageResult = await store.importImage(repoGroupKey, sourcePath)
      return result.ok ? { ok: true, identities: await toViews(result.identities) } : result
    },
    /** The renderer draws each repo icon to a PNG, since Windows toasts can't show SVG or a React icon. */
    setRendered: async (repoGroupKey: string, dataUrl: string): Promise<void> => {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_DATA_URL)) return
      const bytes = Buffer.from(dataUrl.slice(PNG_DATA_URL.length), 'base64')
      if (bytes.length === 0 || bytes.length > MAX_RENDERED_BYTES) return
      const file = join(renderedDir, `${createHash('sha256').update(repoGroupKey).digest('hex').slice(0, 32)}.png`)
      await fs.mkdir(renderedDir, { recursive: true })
      await fs.writeFile(file, bytes)
      rendered.set(repoGroupKey, file)
    },
    notificationIcon: async (cwd: string): Promise<string> => {
      const [workspaces, identities] = await Promise.all([listWorkspaces(), store.list()])
      const choice = chooseNotificationIcon({ cwd, workspaces, identities, rendered: new Set(rendered.keys()) })
      if (choice.kind === 'image') return store.imagePath(choice.file)
      if (choice.kind === 'rendered') return rendered.get(choice.repoGroupKey) ?? appIcon
      return appIcon
    }
  }
}

export type RepoIdentityService = ReturnType<typeof createRepoIdentityService>
