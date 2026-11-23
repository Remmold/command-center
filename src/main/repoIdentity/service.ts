import { existsSync, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Workspace } from '../../shared/types'
import type {
  ChooseImageResult,
  FoundIconView,
  RepoIconChoice,
  RepoIdentities,
  RepoIdentity,
  RepoIdentityViews
} from '../../shared/repoIdentity'
import { engineIconReferences } from './engineDefaults'
import { findIconCandidates } from './findIcons'
import { rankIconCandidates, type IconCandidate } from './rankIcons'
import { createRepoIdentityStore, shortHash, SEARCH_VERSION, type FoundImage } from './store'
import { chooseNotificationIcon } from './notificationIcon'
import { parseIcon } from './validate'

const PNG_DATA_URL = 'data:image/png;base64,'
const MAX_RENDERED_BYTES = 256 * 1024
const MAX_FOUND = 12
const MAX_EXES_CHECKED = 12
/** The app has only a dark theme. */
const THEME = 'dark'

export interface LoadedImage {
  bytes: Buffer
  ext: 'png' | 'svg'
}

/** Electron's image reading, kept out so the service runs in plain Node tests. */
export interface IconImages {
  /** A found image as a small PNG, or an SVG as is; null when it can't be read. */
  load: (path: string) => Promise<LoadedImage | null>
  /**
   * An executable's own icon as PNG, read from its resources; it is never run. `generic` when it is
   * Windows' plain program icon or the same icon as one of `engineDefaults`.
   */
  exeIcon: (path: string, engineDefaults: string[]) => Promise<{ bytes: Buffer; generic: boolean } | null>
}

export interface RepoIdentityServiceDeps {
  dataDir: string
  appIcon: string
  listWorkspaces: () => Promise<Workspace[]>
  images: IconImages
  onChanged: (views: RepoIdentityViews) => void
}

function requireKey(repoGroupKey: unknown): string {
  if (typeof repoGroupKey !== 'string' || !repoGroupKey) throw new Error('repo group key must be a string')
  return repoGroupKey
}

const mimeOf = (file: string): string => (file.endsWith('.svg') ? 'image/svg+xml' : 'image/png')

/** The repo's main checkout, else any of its worktrees. */
function repoRoots(workspaces: readonly Workspace[]): Map<string, string> {
  const roots = new Map<string, string>()
  for (const w of workspaces) if (!roots.has(w.repoGroupKey) || !w.worktreeTag) roots.set(w.repoGroupKey, w.path)
  return roots
}

export function createRepoIdentityService({ dataDir, appIcon, listWorkspaces, images, onChanged }: RepoIdentityServiceDeps) {
  const store = createRepoIdentityStore(dataDir)
  const renderedDir = join(dataDir, 'repo-icons', 'notify')
  // Kept on disk, so notifications show the repo icon right after a restart, before the renderer redraws.
  const renderedPath = (repoGroupKey: string): string => join(renderedDir, `${shortHash(repoGroupKey)}.png`)

  const dataUrl = async (file: string): Promise<string | null> => {
    try {
      return `data:${mimeOf(file)};base64,${(await fs.readFile(store.imagePath(file))).toString('base64')}`
    } catch (err) {
      console.warn('[repo icons] missing image', file, err)
      return null
    }
  }

  const toViews = async (identities: RepoIdentities): Promise<RepoIdentityViews> => {
    const views: RepoIdentityViews = {}
    for (const [key, identity] of Object.entries(identities)) {
      const { found, searchVersion: _version, ...own } = identity
      views[key] = { ...own }
      if (identity.icon?.kind === 'image') {
        const url = await dataUrl(identity.icon.file)
        if (url) views[key].imageUrl = url
      }
      if (!found) continue
      const foundViews: FoundIconView[] = []
      for (const f of found) {
        const url = await dataUrl(f.file)
        if (url) foundViews.push({ ...f, url })
      }
      views[key].found = foundViews
    }
    return views
  }

  const toChoice = async (repoGroupKey: string, icon: unknown): Promise<RepoIconChoice | undefined> => {
    if (icon === undefined || icon === null) return undefined
    const request = icon as { kind?: unknown; file?: unknown }
    if (request.kind === 'found') {
      const found = (await store.list())[repoGroupKey]?.found ?? []
      const pick = found.find((f) => f.file === request.file)
      if (!pick) throw new Error('not an icon found in this repo')
      return { kind: 'image', file: pick.file }
    }
    const parsed = parseIcon(icon)
    // Images enter only through importImage or the search, never by a file name the renderer supplies.
    if (parsed?.kind !== 'builtin' && parsed?.kind !== 'letter') throw new Error('not a repo icon choice')
    return parsed
  }

  /** Reads the icons of the best executables; the rest are left out. */
  const withExeIcons = async (root: string, candidates: IconCandidate[]) => {
    const exeIcons = new Map<string, Buffer>()
    const exes = rankIconCandidates(candidates, THEME).filter((c) => c.source === 'exe').slice(0, MAX_EXES_CHECKED)
    const checked: IconCandidate[] = []
    for (const exe of exes) {
      const folder = dirname(join(root, exe.path))
      const engineDefaults = engineIconReferences(await fs.readdir(folder).catch(() => [])).map((n) => join(folder, n))
      const icon = await images.exeIcon(join(root, exe.path), engineDefaults).catch(() => null)
      if (!icon) continue
      exeIcons.set(exe.path, icon.bytes)
      checked.push({ ...exe, genericExeIcon: icon.generic })
    }
    return { candidates: [...candidates.filter((c) => c.source !== 'exe'), ...checked], exeIcons }
  }

  const search = async (root: string): Promise<FoundImage[]> => {
    const { candidates, exeIcons } = await withExeIcons(root, await findIconCandidates(root))
    const out: FoundImage[] = []
    for (const c of rankIconCandidates(candidates, THEME)) {
      if (out.length >= MAX_FOUND) break
      const exeBytes = exeIcons.get(c.path)
      const image = exeBytes ? { bytes: exeBytes, ext: 'png' as const } : await images.load(join(root, c.path)).catch(() => null)
      if (image) out.push({ ...image, path: c.path, source: c.source })
    }
    return out
  }

  let queue: Promise<unknown> = Promise.resolve()
  const inFlight = new Map<string, Promise<RepoIdentities>>()

  /** Never searched, searched by an older detector, or its automatic icon's file is gone. */
  const needsSearch = (root: string, identity: RepoIdentity | undefined): boolean => {
    const found = identity?.found
    if (!found || identity.searchVersion !== SEARCH_VERSION) return true
    return !!found[0] && !existsSync(join(root, found[0].path))
  }

  /** One search at a time, so a start with many repos stays light. `onlyIfStale` skips a repo searched meanwhile. */
  const detect = (repoGroupKey: string, root: string, onlyIfStale = false): Promise<RepoIdentities> => {
    const running = inFlight.get(repoGroupKey)
    if (running) return running
    const next = queue.then(async () => {
      try {
        const current = await store.list()
        if (onlyIfStale && !needsSearch(root, current[repoGroupKey])) return current
        const all = await store.setFound(repoGroupKey, await search(root))
        onChanged(await toViews(all))
        return all
      } finally {
        inFlight.delete(repoGroupKey)
      }
    })
    inFlight.set(repoGroupKey, next)
    queue = next.catch(() => undefined)
    return next
  }

  return {
    list: async () => toViews(await store.list()),
    setDisplayName: async (repoGroupKey: unknown, name: unknown) =>
      toViews(await store.setDisplayName(requireKey(repoGroupKey), typeof name === 'string' ? name : '')),
    setIcon: async (repoGroupKey: unknown, icon: unknown) => {
      const key = requireKey(repoGroupKey)
      return toViews(await store.setIcon(key, await toChoice(key, icon)))
    },
    importImage: async (repoGroupKey: unknown, sourcePath: string): Promise<ChooseImageResult> => {
      const result = await store.importImage(requireKey(repoGroupKey), sourcePath)
      return result.ok ? { ok: true, identities: await toViews(result.identities) } : result
    },
    detectAgain: async (repoGroupKey: unknown): Promise<RepoIdentityViews> => {
      const key = requireKey(repoGroupKey)
      const root = repoRoots(await listWorkspaces()).get(key)
      return toViews(root ? await detect(key, root) : await store.list())
    },
    /** Searches every repo not searched yet, searched by an older detector, or whose automatic icon's file is gone. */
    detectMissing: async (): Promise<void> => {
      const [roots, identities] = await Promise.all([listWorkspaces().then(repoRoots), store.list()])
      for (const [key, root] of roots) {
        if (!needsSearch(root, identities[key])) continue
        await detect(key, root, true).catch((err) => console.error('[repo icons] search failed for', root, err))
      }
    },
    /** The renderer draws each repo icon to a PNG, since Windows toasts can't show SVG or a React icon. */
    setRendered: async (repoGroupKey: unknown, pngDataUrl: unknown): Promise<void> => {
      if (typeof pngDataUrl !== 'string' || !pngDataUrl.startsWith(PNG_DATA_URL)) return
      const bytes = Buffer.from(pngDataUrl.slice(PNG_DATA_URL.length), 'base64')
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
