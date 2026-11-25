import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import { POLL_MS } from '../observed/tail'
import { stampOf, type WatchedFile } from './reader'

interface Entry {
  path: string
  stamp: string
  watchers: Set<string>
  settle: NodeJS.Timeout | null
  checking: Promise<void>
}

interface Folder {
  watcher: FSWatcher | null
  files: number
}

export interface WatchTiming {
  pollMs: number
  /** A write arrives as several watch events; one check after they settle sends one change. */
  settleMs: number
}

const keyOf = (path: string): string => path.toLowerCase()

/**
 * The files each watcher of a test flow shows or waits for, watched through their folder with a poll as backstop.
 * A file's change is sent once to each watcher of it; a file no watcher lists is no longer watched.
 */
export class TestFlowWatches {
  private readonly entries = new Map<string, Entry>()
  private readonly folders = new Map<string, Folder>()
  private readonly byWatcher = new Map<string, string[]>()
  private poll: NodeJS.Timeout | null = null

  constructor(
    private readonly notify: (watcher: string) => void,
    private readonly timing: WatchTiming = { pollMs: POLL_MS, settleMs: 150 }
  ) {}

  set(watcher: string, files: readonly WatchedFile[]): void {
    const keys = [...new Set(files.map((f) => keyOf(f.path)))]
    for (const file of files) {
      const key = keyOf(file.path)
      let entry = this.entries.get(key)
      if (!entry) {
        entry = { path: file.path, stamp: file.stamp, watchers: new Set(), settle: null, checking: Promise.resolve() }
        this.entries.set(key, entry)
        this.addFolder(dirname(file.path))
      } else if (entry.stamp !== file.stamp) {
        // The watcher read the file before a change another watcher was already told about.
        this.tellLater(watcher, key)
      }
      entry.watchers.add(watcher)
    }
    this.drop(watcher, (this.byWatcher.get(watcher) ?? []).filter((key) => !keys.includes(key)))
    if (keys.length > 0) this.byWatcher.set(watcher, keys)
    else this.byWatcher.delete(watcher)
    this.updatePoll()
  }

  release(watcher: string): void {
    this.drop(watcher, this.byWatcher.get(watcher) ?? [])
    this.byWatcher.delete(watcher)
    this.updatePoll()
  }

  watched(): string[] {
    return [...this.entries.values()].map((e) => e.path)
  }

  dispose(): void {
    for (const watcher of [...this.byWatcher.keys()]) this.release(watcher)
  }

  private tellLater(watcher: string, key: string): void {
    setTimeout(() => {
      if (this.entries.get(key)?.watchers.has(watcher)) this.notify(watcher)
    }, this.timing.settleMs)
  }

  private drop(watcher: string, keys: readonly string[]): void {
    for (const key of keys) {
      const entry = this.entries.get(key)
      if (!entry) continue
      entry.watchers.delete(watcher)
      if (entry.watchers.size > 0) continue
      if (entry.settle) clearTimeout(entry.settle)
      this.entries.delete(key)
      this.removeFolder(dirname(entry.path))
    }
  }

  private addFolder(dir: string): void {
    const key = keyOf(dir)
    const folder = this.folders.get(key)
    if (folder) {
      folder.files++
      return
    }
    let watcher: FSWatcher | null = null
    try {
      watcher = watch(dir, (_event, name) => this.changedIn(key, name ? String(name) : null))
      watcher.on('error', () => watcher?.close())
    } catch {
      watcher = null
    }
    this.folders.set(key, { watcher, files: 1 })
  }

  private removeFolder(dir: string): void {
    const key = keyOf(dir)
    const folder = this.folders.get(key)
    if (!folder || --folder.files > 0) return
    folder.watcher?.close()
    this.folders.delete(key)
  }

  private changedIn(dirKey: string, name: string | null): void {
    for (const entry of this.entries.values()) {
      if (keyOf(dirname(entry.path)) !== dirKey) continue
      if (name === null || keyOf(basename(entry.path)) === keyOf(name)) this.check(entry)
    }
  }

  private updatePoll(): void {
    if (this.entries.size > 0 && !this.poll) {
      // fs.watch on Windows can miss writes from another process.
      this.poll = setInterval(() => {
        for (const entry of this.entries.values()) this.check(entry)
      }, this.timing.pollMs)
    } else if (this.entries.size === 0 && this.poll) {
      clearInterval(this.poll)
      this.poll = null
    }
  }

  private check(entry: Entry): void {
    if (entry.settle) clearTimeout(entry.settle)
    entry.settle = setTimeout(() => {
      entry.settle = null
      entry.checking = entry.checking.then(async () => {
        const stamp = await stampOf(entry.path)
        if (stamp === entry.stamp || this.entries.get(keyOf(entry.path)) !== entry) return
        entry.stamp = stamp
        for (const watcher of entry.watchers) this.notify(watcher)
      })
    }, this.timing.settleMs)
  }
}
