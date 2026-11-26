import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import type { SettingsFileChange } from '../../shared/claudeSettings'
import { POLL_MS } from '../observed/tail'
import { readSettingsFile } from './settingsFile'

export interface SettingsWatchTiming {
  pollMs: number
  /** A write arrives as several watch events; one read after they settle sends one change. */
  settleMs: number
}

interface Entry {
  path: string
  text: string | null
  settle: NodeJS.Timeout | null
}

const keyOf = (path: string): string => path.toLowerCase()

/**
 * The settings files on screen, each watched through its folder with a poll as backstop. A file whose
 * text differs from the last one seen is sent once with its new snapshot.
 */
export class SettingsFileWatch {
  private entries = new Map<string, Entry>()
  private folders: FSWatcher[] = []
  private poll: NodeJS.Timeout | null = null
  private checking: Promise<void> = Promise.resolve()

  constructor(
    private readonly notify: (change: SettingsFileChange) => void,
    private readonly timing: SettingsWatchTiming = { pollMs: POLL_MS, settleMs: 150 }
  ) {}

  /** Replaces the watched files; each snapshot is the file as the page last read it. */
  set(files: readonly SettingsFileChange[]): void {
    this.clear()
    for (const { path, snapshot } of files) this.entries.set(keyOf(path), { path, text: snapshot.text, settle: null })
    for (const dir of new Set([...this.entries.values()].map((e) => dirname(e.path)))) this.watchFolder(dir)
    // fs.watch on Windows can miss writes from another process, and can't watch a folder not made yet.
    if (this.entries.size > 0) this.poll = setInterval(() => this.entries.forEach((e) => this.check(e)), this.timing.pollMs)
  }

  /** The page wrote this file itself and already holds the snapshot, so its own write is not sent back. */
  saved({ path, snapshot }: SettingsFileChange): void {
    const entry = this.entries.get(keyOf(path))
    if (entry) entry.text = snapshot.text
  }

  clear(): void {
    for (const entry of this.entries.values()) if (entry.settle) clearTimeout(entry.settle)
    this.entries = new Map()
    for (const watcher of this.folders) watcher.close()
    this.folders = []
    if (this.poll) clearInterval(this.poll)
    this.poll = null
  }

  private watchFolder(dir: string): void {
    try {
      const watcher = watch(dir, (_event, name) => {
        for (const entry of this.entries.values()) {
          if (keyOf(dirname(entry.path)) !== keyOf(dir)) continue
          if (!name || keyOf(basename(entry.path)) === keyOf(String(name))) this.check(entry)
        }
      })
      watcher.on('error', () => watcher.close())
      this.folders.push(watcher)
    } catch {
      // A missing folder is left to the poll.
    }
  }

  private check(entry: Entry): void {
    if (entry.settle) clearTimeout(entry.settle)
    entry.settle = setTimeout(() => {
      entry.settle = null
      this.checking = this.checking.then(async () => {
        const first = await readSettingsFile(entry.path).catch(() => null)
        if (!first || first.text === entry.text) return
        // A write in place empties the file first; only text that holds still is sent.
        await new Promise((done) => setTimeout(done, this.timing.settleMs))
        const snapshot = await readSettingsFile(entry.path).catch(() => null)
        if (!snapshot || this.entries.get(keyOf(entry.path)) !== entry) return
        if (snapshot.text !== first.text) return this.check(entry)
        entry.text = snapshot.text
        this.notify({ path: entry.path, snapshot })
      })
    }, this.timing.settleMs)
  }
}
