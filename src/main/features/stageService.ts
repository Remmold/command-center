import { watch, type FSWatcher } from 'node:fs'
import type { FeatureStageView } from '../../shared/featureStage'
import type { FeatureRecord } from '../../shared/features'
import type { Workspace } from '../../shared/types'
import { nodeFileReader } from '../board/nodeFileReader'
import { readFeatureStage } from './stage'

const DEBOUNCE_MS = 250
const POLL_MS = 15_000

export interface StageServiceDeps {
  listFeatures: () => Promise<FeatureRecord[]>
  listWorkspaces: () => Promise<Workspace[]>
  testFlowsFolder: () => Promise<string>
  push: (stages: Record<string, FeatureStageView>) => void
}

/** Each feature's stage, re-read whenever a file that decides it may have changed. Nothing is stored. */
export function createStageService(deps: StageServiceDeps) {
  let current: Record<string, FeatureStageView> = {}
  let last = '{}'
  let timer: NodeJS.Timeout | null = null
  let stopped = false
  let reading: Promise<void> = Promise.resolve()
  let watcher: FSWatcher | null = null
  let watched = ''
  // A removed worktree folder raises no event inside any watched folder.
  const poll = setInterval(() => schedule(), POLL_MS)

  const watchFlows = (folder: string): void => {
    if (folder === watched) return
    watcher?.close()
    watched = folder
    try {
      watcher = watch(folder, { recursive: true }, () => schedule())
      watcher.on('error', () => watcher?.close())
    } catch {
      watcher = null
    }
  }

  const readAll = async (): Promise<void> => {
    const [features, workspaces, folder] = await Promise.all([deps.listFeatures(), deps.listWorkspaces(), deps.testFlowsFolder()])
    watchFlows(folder)
    const entries = await Promise.all(
      features.map(async (f) => {
        const repoName = workspaces.find((w) => w.id === f.workspaceId)?.repoName ?? ''
        const view = await readFeatureStage(f, { files: nodeFileReader, testFlowsFolder: folder, repoName }).catch((): FeatureStageView => ({ missing: true }))
        return [f.name, view] as const
      })
    )
    current = Object.fromEntries(entries)
    const json = JSON.stringify(current)
    if (json === last) return
    last = json
    if (!stopped) deps.push(current)
  }

  function schedule(): void {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void refresh()
    }, DEBOUNCE_MS)
  }

  function refresh(): Promise<void> {
    reading = reading.then(readAll).catch((err) => console.error('[features] stage read failed', err))
    return reading
  }

  return {
    current: async (): Promise<Record<string, FeatureStageView>> => {
      await refresh()
      return current
    },
    /** The last read without reading again; every change of it is pushed. */
    snapshot: (): Record<string, FeatureStageView> => current,
    /** A feature file or record changed; the board's watch on every workspace's `.scratch` calls this. */
    changed: schedule,
    stop: (): void => {
      stopped = true
      clearInterval(poll)
      if (timer) clearTimeout(timer)
      watcher?.close()
    }
  }
}

export type StageService = ReturnType<typeof createStageService>
