import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Workspace } from '../../shared/types'
import { createRepoIdentityService, type IconImages } from './service'

const KEY = 'git:c:/repo/.git'
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'

let dir: string
let repo: string

function pngOf(size: number): Buffer {
  const b = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b)
  b.writeUInt32BE(size, 16)
  b.writeUInt32BE(size, 20)
  return b
}

const images: IconImages = {
  load: async (path) => {
    const bytes = await fs.readFile(path)
    return path.endsWith('.svg') ? { bytes, ext: 'svg' } : { bytes, ext: 'png' }
  },
  // The file's bytes stand in for its icon, so an exe copied from its crash handler has the engine's icon.
  exeIcon: async (path, engineDefaults) => {
    const bytes = await fs.readFile(path)
    const same = await Promise.all(engineDefaults.map(async (ref) => (await fs.readFile(ref)).equals(bytes)))
    return { bytes: pngOf(256), generic: same.includes(true) }
  }
}

async function put(path: string, bytes: Buffer | string): Promise<void> {
  await fs.mkdir(dirname(join(repo, path)), { recursive: true })
  await fs.writeFile(join(repo, path), bytes)
}

function service() {
  const workspace = { id: 'w', name: 'repo', path: repo, repoGroupKey: KEY, repoName: 'repo', worktreeTag: '' } as Workspace
  return createRepoIdentityService({ dataDir: dir, appIcon: 'app.png', listWorkspaces: async () => [workspace], images, onChanged: () => {} })
}

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'cc-icons-data-'))
  repo = await fs.mkdtemp(join(tmpdir(), 'cc-icons-repo-'))
  await put('public/favicon.svg', SVG)
  await put('brand/app-icon-1024.png', pngOf(1024))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.rm(repo, { recursive: true, force: true })
})

describe('repo identity service', () => {
  it('uses the best icon found in a repo not searched before, and lists every one found', async () => {
    const icons = service()
    await icons.detectMissing()
    const found = (await icons.list())[KEY]?.found ?? []
    expect(found.map((f) => f.path)).toEqual(['brand/app-icon-1024.png', 'public/favicon.svg'])
    expect((await icons.list())[KEY]?.icon).toBeUndefined()
  })

  it('keeps an icon the user picked when the repo is searched again', async () => {
    const icons = service()
    await icons.detectMissing()
    const favicon = (await icons.list())[KEY]!.found!.find((f) => f.path === 'public/favicon.svg')!
    await icons.setIcon(KEY, { kind: 'found', file: favicon.file })
    await icons.detectAgain(KEY)
    expect((await icons.list())[KEY]?.icon).toEqual({ kind: 'image', file: favicon.file })
  })

  it('refuses a found icon that is not in the repo’s list', async () => {
    await expect(service().setIcon(KEY, { kind: 'found', file: 'ab'.repeat(16) + '.png' })).rejects.toThrow()
  })

  it('searches again on start only when the automatic icon’s file is gone', async () => {
    const icons = service()
    await icons.detectMissing()
    await put('icon.png', pngOf(512))
    await icons.detectMissing()
    expect((await icons.list())[KEY]?.found?.[0].path).toBe('brand/app-icon-1024.png')

    await fs.rm(join(repo, 'brand'), { recursive: true })
    await icons.detectMissing()
    expect((await icons.list())[KEY]?.found?.map((f) => f.path)).toEqual(['icon.png', 'public/favicon.svg'])
  })

  it('skips a Unity build whose exe carries the Unity default icon, and keeps one with its own icon', async () => {
    await fs.rm(join(repo, 'public'), { recursive: true })
    await fs.rm(join(repo, 'brand'), { recursive: true })
    await put('Builds/Windows/UnityPlayer.dll', 'player')
    await put('Builds/Windows/UnityCrashHandler64.exe', 'unity cube')
    await put('Builds/Windows/Game.exe', 'unity cube')
    const icons = service()
    await icons.detectMissing()
    expect((await icons.list())[KEY]?.found).toEqual([])

    await put('Builds/Windows/Game.exe', 'the game’s own icon')
    await icons.detectAgain(KEY)
    expect((await icons.list())[KEY]?.found?.map((f) => f.path)).toEqual(['Builds/Windows/Game.exe'])
  })

  it('searches again on start a repo searched by an older version, keeping the user’s pick', async () => {
    await fs.writeFile(
      join(dir, 'repo-identities.json'),
      JSON.stringify({ [KEY]: { icon: { kind: 'letter' }, found: [{ file: 'ab'.repeat(16) + '.png', path: 'public/favicon.svg', source: 'file' }] } })
    )
    const icons = service()
    await icons.detectMissing()
    const identity = (await icons.list())[KEY]
    expect(identity?.found?.map((f) => f.path)).toEqual(['brand/app-icon-1024.png', 'public/favicon.svg'])
    expect(identity?.icon).toEqual({ kind: 'letter' })
  })

  it('writes nothing into the repo', async () => {
    const before = await fs.readdir(repo, { recursive: true })
    await service().detectMissing()
    expect(await fs.readdir(repo, { recursive: true })).toEqual(before)
  })
})
