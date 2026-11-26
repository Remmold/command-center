import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsFileChange } from '../../shared/claudeSettings'
import { readSettingsFile } from './settingsFile'
import { SettingsFileWatch } from './settingsWatch'

let folder: string
let changes: SettingsFileChange[]
let watch: SettingsFileWatch

const QUIET_MS = 400
/** Only for proving nothing was sent; a change that should arrive is waited for with `arrived`. */
const quiet = () => new Promise((done) => setTimeout(done, QUIET_MS))
const arrived = (check: () => void) => vi.waitFor(check, { timeout: 5000, interval: 20 })
const paths = () => changes.map((c) => c.path)
const text = (value: unknown): string => JSON.stringify(value, null, 2) + '\n'
const watched = async (path: string) => ({ path, snapshot: await readSettingsFile(path) })

beforeEach(async () => {
  folder = await fs.mkdtemp(join(tmpdir(), 'cc-settings-watch-'))
  changes = []
  watch = new SettingsFileWatch((change) => changes.push(change), { pollMs: 100, settleMs: 40 })
})

afterEach(async () => {
  watch.clear()
  await fs.rm(folder, { recursive: true, force: true })
})

describe('watching the settings files on screen', () => {
  it('sends the new snapshot once when a file changes on disk', async () => {
    const file = join(folder, 'settings.json')
    await fs.writeFile(file, text({ model: 'sonnet' }))
    watch.set([await watched(file)])
    await quiet()
    expect(changes).toEqual([])

    await fs.writeFile(file, text({ model: 'opus', theme: 'dark' }))
    await arrived(() => expect(changes).toHaveLength(1))
    await quiet()
    expect(changes).toHaveLength(1)
    expect(changes[0].path).toBe(file)
    expect(changes[0].snapshot.value).toEqual({ model: 'opus', theme: 'dark' })
  })

  it('sends nothing when a file is rewritten with the same text', async () => {
    const file = join(folder, 'settings.json')
    await fs.writeFile(file, text({ model: 'sonnet' }))
    watch.set([await watched(file)])
    await fs.writeFile(file, text({ model: 'sonnet' }))
    await quiet()
    expect(changes).toEqual([])
  })

  it('sends nothing for a save from the page it was told about', async () => {
    const file = join(folder, 'settings.json')
    await fs.writeFile(file, text({ model: 'sonnet' }))
    watch.set([await watched(file)])
    await fs.writeFile(file, text({ model: 'opus' }))
    watch.saved(await watched(file))
    await quiet()
    expect(changes).toEqual([])
  })

  it('sees a file appear in a folder that did not exist yet', async () => {
    const file = join(folder, 'repo', '.claude', 'settings.local.json')
    watch.set([await watched(file)])
    await fs.mkdir(join(folder, 'repo', '.claude'), { recursive: true })
    await fs.writeFile(file, text({ model: 'haiku' }))
    await arrived(() => expect(changes.map((c) => c.snapshot.value)).toEqual([{ model: 'haiku' }]))
  })

  it('stops watching the files a new set leaves out, and everything once cleared', async () => {
    const account = join(folder, 'settings.json')
    const local = join(folder, 'settings.local.json')
    await fs.writeFile(account, text({}))
    await fs.writeFile(local, text({}))
    watch.set([await watched(account), await watched(local)])
    watch.set([await watched(local)])
    await fs.writeFile(account, text({ model: 'opus' }))
    await fs.writeFile(local, text({ model: 'opus' }))
    await arrived(() => expect(paths()).toEqual([local]))
    await quiet()
    expect(paths()).toEqual([local])

    watch.clear()
    await fs.writeFile(local, text({ model: 'haiku' }))
    await quiet()
    expect(paths()).toEqual([local])
  })
})
