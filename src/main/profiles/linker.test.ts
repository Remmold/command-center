import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureProfileLinks } from './linker'

let root: string
let defaultDir: string
let profileDir: string

async function exists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path)
    return true
  } catch {
    return false
  }
}

async function sameFile(a: string, b: string): Promise<boolean> {
  const [sa, sb] = await Promise.all([fs.stat(a, { bigint: true }), fs.stat(b, { bigint: true })])
  return sa.ino === sb.ino && sa.dev === sb.dev
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'cc-profiles-'))
  defaultDir = join(root, 'default')
  profileDir = join(root, 'profile')
  await fs.mkdir(join(defaultDir, 'skills', 'grill'), { recursive: true })
  await fs.writeFile(join(defaultDir, 'skills', 'grill', 'SKILL.md'), 'grill')
  await fs.mkdir(join(defaultDir, 'projects'), { recursive: true })
  await fs.writeFile(join(defaultDir, 'CLAUDE.md'), 'global rules')
  await fs.writeFile(join(defaultDir, '.credentials.json'), '{"token":"secret"}')
  await fs.writeFile(join(defaultDir, '.claude.json'), '{}')
  await fs.writeFile(join(defaultDir, 'history.jsonl'), '')
  await fs.mkdir(profileDir, { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('ensureProfileLinks', () => {
  it('makes each shared directory a junction to Default', async () => {
    await ensureProfileLinks({ defaultDir, profileDir })

    const link = join(profileDir, 'skills')
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true)
    expect(await fs.readFile(join(link, 'grill', 'SKILL.md'), 'utf-8')).toBe('grill')
    await fs.writeFile(join(profileDir, 'projects', 'from-profile.jsonl'), 'x')
    expect(await exists(join(defaultDir, 'projects', 'from-profile.jsonl'))).toBe(true)
  })

  it('makes each shared file a hard link to Default', async () => {
    await ensureProfileLinks({ defaultDir, profileDir })

    const link = join(profileDir, 'CLAUDE.md')
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(false)
    expect(await sameFile(link, join(defaultDir, 'CLAUDE.md'))).toBe(true)
  })

  it('never creates or links the login, the account file or per-machine state', async () => {
    await ensureProfileLinks({ defaultDir, profileDir })

    expect(await exists(join(profileDir, '.credentials.json'))).toBe(false)
    expect(await exists(join(profileDir, '.claude.json'))).toBe(false)
    expect(await exists(join(profileDir, 'history.jsonl'))).toBe(false)
    expect(await fs.readFile(join(defaultDir, '.credentials.json'), 'utf-8')).toBe('{"token":"secret"}')
  })

  it('leaves healthy links alone on the next run', async () => {
    await ensureProfileLinks({ defaultDir, profileDir })
    const repairs = await ensureProfileLinks({ defaultDir, profileDir })

    expect(repairs).toEqual([])
    expect((await fs.readdir(profileDir)).sort()).toEqual(['CLAUDE.md', 'projects', 'skills'])
  })

  it('re-creates deleted links on the next run', async () => {
    await ensureProfileLinks({ defaultDir, profileDir })
    await fs.unlink(join(profileDir, 'skills'))
    await fs.unlink(join(profileDir, 'CLAUDE.md'))

    const repairs = await ensureProfileLinks({ defaultDir, profileDir })

    expect(repairs).toEqual([
      { item: 'CLAUDE.md', action: 'linked' },
      { item: 'skills', action: 'linked' }
    ])
    expect(await sameFile(join(profileDir, 'CLAUDE.md'), join(defaultDir, 'CLAUDE.md'))).toBe(true)
    expect(await fs.readFile(join(profileDir, 'skills', 'grill', 'SKILL.md'), 'utf-8')).toBe('grill')
  })

  it('re-points a junction that leads somewhere else or nowhere', async () => {
    const elsewhere = join(root, 'elsewhere')
    await fs.mkdir(elsewhere)
    await fs.symlink(elsewhere, join(profileDir, 'skills'), 'junction')
    await fs.rm(elsewhere, { recursive: true })

    const repairs = await ensureProfileLinks({ defaultDir, profileDir })

    expect(repairs).toContainEqual({ item: 'skills', action: 'relinked' })
    expect(await fs.readFile(join(profileDir, 'skills', 'grill', 'SKILL.md'), 'utf-8')).toBe('grill')
  })

  it('moves a replaced file aside and re-links it to Default', async () => {
    const now = new Date('2026-11-21T10:20:30.000Z')
    await ensureProfileLinks({ defaultDir, profileDir })
    const link = join(profileDir, 'CLAUDE.md')
    await fs.writeFile(`${link}.tmp`, 'edited in the profile')
    await fs.rename(`${link}.tmp`, link)

    const repairs = await ensureProfileLinks({ defaultDir, profileDir }, now)

    const movedTo = join(profileDir, 'CLAUDE.md.unlinked-20261121-102030')
    expect(repairs).toEqual([{ item: 'CLAUDE.md', action: 'moved-aside', movedTo }])
    expect(await fs.readFile(movedTo, 'utf-8')).toBe('edited in the profile')
    expect(await sameFile(link, join(defaultDir, 'CLAUDE.md'))).toBe(true)
    expect(await fs.readFile(join(defaultDir, 'CLAUDE.md'), 'utf-8')).toBe('global rules')
  })

  it('moves a real folder aside and puts the junction in its place', async () => {
    const now = new Date('2026-11-21T10:20:30.000Z')
    await fs.mkdir(join(profileDir, 'skills'))
    await fs.writeFile(join(profileDir, 'skills', 'local.md'), 'local')

    const repairs = await ensureProfileLinks({ defaultDir, profileDir }, now)

    const movedTo = join(profileDir, 'skills.unlinked-20261121-102030')
    expect(repairs).toContainEqual({ item: 'skills', action: 'moved-aside', movedTo })
    expect(await fs.readFile(join(movedTo, 'local.md'), 'utf-8')).toBe('local')
    expect((await fs.lstat(join(profileDir, 'skills'))).isSymbolicLink()).toBe(true)
    expect(await exists(join(defaultDir, 'skills', 'local.md'))).toBe(false)
  })

  it('also shares the files that settings point at inside Default', async () => {
    await fs.writeFile(join(defaultDir, 'statusline.js'), 'status')
    await fs.writeFile(
      join(defaultDir, 'settings.json'),
      JSON.stringify({
        statusLine: { type: 'command', command: `node ${defaultDir.replace(/\\/g, '/')}/statusline.js` },
        apiKeyHelper: `type ${join(defaultDir, '.credentials.json')}`,
        hooks: { Stop: [{ hooks: [{ command: `python ${join(root, 'outside.py')}` }] }] }
      })
    )

    await ensureProfileLinks({ defaultDir, profileDir })

    expect(await sameFile(join(profileDir, 'statusline.js'), join(defaultDir, 'statusline.js'))).toBe(true)
    expect(await exists(join(profileDir, '.credentials.json'))).toBe(false)
    expect((await fs.readdir(profileDir)).sort()).toEqual([
      'CLAUDE.md',
      'projects',
      'settings.json',
      'skills',
      'statusline.js'
    ])
  })

  it('skips shared items that Default does not have', async () => {
    await ensureProfileLinks({ defaultDir, profileDir })

    expect(await exists(join(profileDir, 'agents'))).toBe(false)
    expect(await exists(join(defaultDir, 'agents'))).toBe(false)
  })
})
