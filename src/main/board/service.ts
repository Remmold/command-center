import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import type { BoardModel, Workspace } from '../../shared/types'
import { readBoard } from './reader'
import { nodeFileReader } from './nodeFileReader'

const DEBOUNCE_MS = 250

interface WorkspaceWatch {
  path: string
  root: FSWatcher | null
  scratch: FSWatcher | null
}

function tryWatch(path: string, recursive: boolean, onChange: (file: string | null) => void): FSWatcher | null {
  try {
    const watcher = watch(path, { recursive }, (_event, file) => onChange(file ? String(file) : null))
    watcher.on('error', () => watcher.close())
    return watcher
  } catch {
    return null
  }
}

function closeWatch(w: WorkspaceWatch): void {
  w.root?.close()
  w.scratch?.close()
}

export class BoardService {
  private workspaces: Workspace[] = []
  private watches = new Map<string, WorkspaceWatch>()
  private timer: NodeJS.Timeout | null = null
  private model: BoardModel = { repoGroups: [] }
  private lastJson = ''
  private reading: Promise<void> = Promise.resolve()

  constructor(
    private readonly listWorkspaces: () => Promise<Workspace[]>,
    private readonly push: (model: BoardModel) => void
  ) {}

  current(): BoardModel {
    return this.model
  }

  /** Call after any workspace is added or removed. */
  async refresh(): Promise<BoardModel> {
    this.workspaces = await this.listWorkspaces()
    this.syncWatches()
    await this.reread()
    return this.model
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const w of this.watches.values()) closeWatch(w)
    this.watches.clear()
  }

  private syncWatches(): void {
    const wanted = new Map(this.workspaces.map((w) => [w.id, w.path]))
    for (const [id, w] of this.watches) {
      if (wanted.get(id) !== w.path) {
        closeWatch(w)
        this.watches.delete(id)
      }
    }
    for (const [id, path] of wanted) {
      if (this.watches.has(id)) continue
      const w: WorkspaceWatch = { path, root: null, scratch: null }
      // The root watch notices `.scratch` being created or deleted.
      w.root = tryWatch(path, false, (file) => {
        if (file === null || file.toLowerCase() === '.scratch') {
          w.scratch?.close()
          w.scratch = this.watchScratch(path)
          this.schedule()
        }
      })
      w.scratch = this.watchScratch(path)
      this.watches.set(id, w)
    }
  }

  private watchScratch(workspacePath: string): FSWatcher | null {
    return tryWatch(join(workspacePath, '.scratch'), true, () => this.schedule())
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.reread()
    }, DEBOUNCE_MS)
  }

  private reread(): Promise<void> {
    this.reading = this.reading.then(async () => {
      try {
        const model = await readBoard(this.workspaces, nodeFileReader)
        const json = JSON.stringify(model)
        this.model = model
        if (json !== this.lastJson) {
          this.lastJson = json
          this.push(model)
        }
      } catch (err) {
        console.error('[board] read failed', err)
      }
    })
    return this.reading
  }
}
