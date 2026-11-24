import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readContextFile, writeContextFile } from './guard'
import { readContext, type ContextReaderInput } from './reader'

let root: string
let account: string
let repo: string

async function put(path: string, text: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, text)
}

const text = (path: string): Promise<string | null> => fs.readFile(path, 'utf8').catch(() => null)

function report(over: Partial<ContextReaderInput> = {}) {
  return readContext({ workspacePath: repo, configDir: account, defaultConfigDir: account, adoptedDirs: [], homeDir: join(root, 'home'), parentsStopAt: root, ...over })
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'cc-context-guard-'))
  account = join(root, 'account')
  repo = join(root, 'projects', 'app')
  await fs.mkdir(account, { recursive: true })
  await fs.mkdir(repo, { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('guarded context file write', () => {
  it('writes a file the report listed', async () => {
    await put(join(repo, 'CLAUDE.md'), 'old')

    const result = await writeContextFile(await report(), join(repo, 'CLAUDE.md'), 'new')

    expect(result).toEqual({ ok: true })
    expect(await text(join(repo, 'CLAUDE.md'))).toBe('new')
  })

  it('refuses a path the report did not list, and leaves it alone', async () => {
    await put(join(repo, 'CLAUDE.md'), 'listed')
    await put(join(repo, 'notes.md'), 'old')

    const result = await writeContextFile(await report(), join(repo, 'notes.md'), 'new')

    expect(result.ok).toBe(false)
    expect(await text(join(repo, 'notes.md'))).toBe('old')
  })

  it('refuses a read-only item in an adopted folder, with the reason', async () => {
    const adopted = join(root, 'vscode-profile')
    await put(join(adopted, 'CLAUDE.md'), 'old')

    const result = await writeContextFile(await report({ configDir: adopted, adoptedDirs: [adopted] }), join(adopted, 'CLAUDE.md'), 'new')

    expect(result).toEqual({ ok: false, error: 'adopted folder: the app never writes here' })
    expect(await text(join(adopted, 'CLAUDE.md'))).toBe('old')
  })

  it('refuses JSON that does not parse, with the parse error, and writes nothing', async () => {
    const settings = join(repo, '.claude', 'settings.json')
    await put(settings, '{}')

    const result = await writeContextFile(await report(), settings, '{ "hooks": ')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/^Invalid JSON: .*JSON/)
    expect(await text(settings)).toBe('{}')
  })

  it('creates a missing repo CLAUDE.md and CLAUDE.local.md on first save', async () => {
    const before = await report()

    expect(await writeContextFile(before, join(repo, 'CLAUDE.md'), 'repo rules')).toEqual({ ok: true })
    expect(await writeContextFile(before, join(repo, 'CLAUDE.local.md'), 'mine')).toEqual({ ok: true })
    expect(await text(join(repo, 'CLAUDE.md'))).toBe('repo rules')
    expect(await text(join(repo, 'CLAUDE.local.md'))).toBe('mine')
  })

  it("never writes or reads the account's .claude.json or .credentials.json, even when listed", async () => {
    const secrets = join(account, '.claude.json')
    await put(secrets, '{}')
    const listed = await report()
    for (const path of [secrets, join(account, '.credentials.json')]) {
      listed.layers.account.push({ kind: 'settings', label: 'x', note: null, path, source: 'account', tokens: null, missing: false, sharedWithDefault: false, readOnly: null, children: [] })
    }

    expect((await writeContextFile(listed, secrets, '{"x":1}')).ok).toBe(false)
    expect((await writeContextFile(listed, join(account, '.credentials.json'), '{}')).ok).toBe(false)
    expect((await readContextFile(listed, secrets)).ok).toBe(false)
    expect(await text(secrets)).toBe('{}')
  })
})

describe('guarded context file write: what it never creates or overwrites', () => {
  it('refuses to create a listed import that is missing', async () => {
    await put(join(repo, 'CLAUDE.md'), '@../outside.md')

    const result = await writeContextFile(await report(), join(root, 'projects', 'outside.md'), 'planted')

    expect(result.ok).toBe(false)
    expect(await text(join(root, 'projects', 'outside.md'))).toBeNull()
  })

  it('does not overwrite a creatable file that appeared after the report', async () => {
    const before = await report()
    await put(join(repo, 'CLAUDE.md'), 'written by someone else')

    expect((await writeContextFile(before, join(repo, 'CLAUDE.md'), 'mine')).ok).toBe(false)
    expect(await text(join(repo, 'CLAUDE.md'))).toBe('written by someone else')
  })

  it('refuses a listed file that is a link to .credentials.json', async (ctx) => {
    const secrets = join(account, '.credentials.json')
    await put(secrets, '{"token":"s"}')
    try {
      await fs.symlink(secrets, join(repo, 'CLAUDE.md'), 'file')
    } catch {
      ctx.skip()
    }
    const listed = await report()

    expect((await readContextFile(listed, join(repo, 'CLAUDE.md'))).ok).toBe(false)
    expect((await writeContextFile(listed, join(repo, 'CLAUDE.md'), '{}')).ok).toBe(false)
    expect(await text(secrets)).toBe('{"token":"s"}')
  })
})

describe('guarded context file read', () => {
  it('reads a listed file, also a read-only one, and refuses an unlisted one', async () => {
    const adopted = join(root, 'vscode-profile')
    await put(join(adopted, 'CLAUDE.md'), 'adopted rules')
    await put(join(repo, 'notes.md'), 'private')
    const listed = await report({ configDir: adopted, adoptedDirs: [adopted] })

    expect(await readContextFile(listed, join(adopted, 'CLAUDE.md'))).toEqual({ ok: true, content: 'adopted rules' })
    expect((await readContextFile(listed, join(repo, 'notes.md'))).ok).toBe(false)
  })

  it('reads a missing creatable file as empty', async () => {
    expect(await readContextFile(await report(), join(repo, 'CLAUDE.local.md'))).toEqual({ ok: true, content: '' })
  })
})
