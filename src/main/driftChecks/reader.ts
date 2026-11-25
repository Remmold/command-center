import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { latestRuns, pathKey, readFindingsRun, type DriftChecksView, type DriftRunView, type FindingsRead, type FindingsRun, type ShownFiles } from '../../shared/findings'
import { stampOf, type WatchedFile } from '../testFlow/reader'

interface Cached {
  stamp: string
  read: FindingsRead
}

interface Entry {
  file: string
  stamp: string
  run: FindingsRun
  writing: boolean
  note: string | null
}

async function modifiedMs(path: string): Promise<number | null> {
  try {
    const stat = await fs.stat(path)
    return stat.isFile() ? stat.mtimeMs : null
  } catch {
    return null
  }
}

/** The drift-checks folder's run files, each parse kept so a half-written file still shows its last good one. */
export class DriftChecksReader {
  private readonly cache = new Map<string, Cached>()

  /** What a workspace's map shows, and the shown run files to follow live: those not done, and those in `fixing` (by run id). */
  async read(folder: string, workspacePath: string, accountFolder: string, fixing: readonly string[] = []): Promise<{ view: DriftChecksView; watch: WatchedFile[] }> {
    const entries = await this.entries(folder)
    const { covering, account } = latestRuns(entries, workspacePath, accountFolder)
    const shown = [covering && { entry: covering, files: account ? 'not-account' : 'all' }, account && { entry: account, files: 'account' }].filter(
      (s): s is { entry: Entry; files: ShownFiles } => s !== null
    )
    const runs = await Promise.all(
      shown.map(async ({ entry, files }): Promise<DriftRunView> => {
        const paths = [...new Set(entry.run.findings.map((f) => f.path))]
        const times = await Promise.all(paths.map(modifiedMs))
        return {
          file: entry.file,
          run: entry.run,
          writing: entry.writing,
          note: entry.note,
          files,
          modified: Object.fromEntries(paths.map((p, i) => [pathKey(p), times[i]]))
        }
      })
    )
    const watch = shown.filter(({ entry }) => !entry.run.done || fixing.includes(entry.run.runId)).map(({ entry }) => ({ path: entry.file, stamp: entry.stamp }))
    return { view: { runs }, watch }
  }

  private async entries(folder: string): Promise<Entry[]> {
    let names: string[]
    try {
      names = (await fs.readdir(folder)).filter((n) => n.toLowerCase().endsWith('.json'))
    } catch {
      return []
    }
    const out: Entry[] = []
    for (const name of names) {
      const file = join(folder, name)
      const stamp = await stampOf(file)
      if (stamp === 'missing') continue
      let cached = this.cache.get(file)
      if (cached?.stamp !== stamp) {
        const text = await fs.readFile(file, 'utf8').catch(() => '')
        cached = { stamp, read: readFindingsRun(text, cached?.read.run ?? null) }
        this.cache.set(file, cached)
      }
      const { run, writing, note } = cached.read
      if (run !== null) out.push({ file, stamp, run, writing, note })
    }
    return out
  }
}
