import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ContextItem } from '../../shared/context'
import { ensureProfileLinks } from '../profiles/linker'
import { readContext, type ContextReaderInput } from './reader'

let root: string
let account: string
let repo: string

async function put(path: string, text: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, text)
}

/** A file of exactly `chars` characters, so its estimate is a known number. */
const chars = (n: number): string => 'x'.repeat(n)

function input(over: Partial<ContextReaderInput> = {}): ContextReaderInput {
  return { workspacePath: repo, configDir: account, defaultConfigDir: account, adoptedDirs: [], homeDir: join(root, 'home'), parentsStopAt: root, ...over }
}

const brief = (item: ContextItem): unknown => ({
  kind: item.kind,
  label: item.label,
  tokens: item.tokens,
  ...(item.missing ? { missing: true } : {}),
  ...(item.children.length ? { children: item.children.map(brief) } : {})
})

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'cc-context-'))
  account = join(root, 'account')
  repo = join(root, 'projects', 'app')
  await fs.mkdir(account, { recursive: true })
  await fs.mkdir(repo, { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('context reader: CLAUDE.md files', () => {
  it('counts the account and repo CLAUDE.md in their layers, and the start total is their sum', async () => {
    await put(join(account, 'CLAUDE.md'), chars(400))
    await put(join(repo, 'CLAUDE.md'), chars(1002))

    const report = await readContext(input())

    expect(report.folderExists).toBe(true)
    expect(report.layers.account.map(brief)).toEqual([{ kind: 'claude-md', label: 'CLAUDE.md', tokens: 100 }])
    expect(report.layers.account[0].path).toBe(join(account, 'CLAUDE.md'))
    expect(report.layers.account[0].source).toBe('account')
    expect(report.layers.repo.map(brief)).toEqual([{ kind: 'claude-md', label: 'CLAUDE.md', tokens: 251 }])
    expect(report.layers.repo[0].source).toBe('repo')
    expect(report.layers.local).toEqual([])
    expect(report.startTotal).toBe(351)
    expect(report.missing).toEqual(['claude-local-md'])
  })

  it('counts CLAUDE.local.md in the local layer', async () => {
    await put(join(repo, 'CLAUDE.local.md'), chars(80))

    const report = await readContext(input())

    expect(report.layers.local.map(brief)).toEqual([{ kind: 'claude-md', label: 'CLAUDE.local.md', tokens: 20 }])
    expect(report.startTotal).toBe(20)
    expect(report.missing).toEqual(['repo-claude-md'])
  })

  it("counts every parent CLAUDE.md in the repo layer, outermost first, before the repo's own", async () => {
    await put(join(root, 'CLAUDE.md'), chars(40))
    await put(join(root, 'projects', 'CLAUDE.md'), chars(8))
    await put(join(repo, 'CLAUDE.md'), chars(4))

    const report = await readContext(input())

    expect(report.layers.repo.map((i) => [i.label, i.path, i.tokens])).toEqual([
      [join(root, 'CLAUDE.md'), join(root, 'CLAUDE.md'), 10],
      [join(root, 'projects', 'CLAUDE.md'), join(root, 'projects', 'CLAUDE.md'), 2],
      ['CLAUDE.md', join(repo, 'CLAUDE.md'), 1]
    ])
    expect(report.startTotal).toBe(13)
  })

  it('says a workspace folder is gone instead of listing empty layers', async () => {
    await put(join(account, 'CLAUDE.md'), chars(400))

    const report = await readContext(input({ workspacePath: join(root, 'gone') }))

    expect(report.folderExists).toBe(false)
    expect(report.layers).toEqual({ account: [], repo: [], local: [] })
    expect(report.startTotal).toBe(0)
  })
})

describe('context reader: imports', () => {
  it('nests imports under their importer, counts them once each, and shows a missing one at 0', async () => {
    // 28 characters with the newline.
    await put(join(repo, 'CLAUDE.md'), 'see @docs/a.md and @gone.md\n')
    await put(join(repo, 'docs', 'a.md'), '@b.md\n' + chars(94))
    // b imports a back: a cycle, which is not followed again.
    await put(join(repo, 'docs', 'b.md'), '@a.md\n' + chars(34))

    const report = await readContext(input())

    expect(report.layers.repo.map(brief)).toEqual([
      {
        kind: 'claude-md',
        label: 'CLAUDE.md',
        tokens: 7,
        children: [
          { kind: 'import', label: '@docs/a.md', tokens: 25, children: [{ kind: 'import', label: '@b.md', tokens: 10 }] },
          { kind: 'import', label: '@gone.md', tokens: 0, missing: true }
        ]
      }
    ])
    expect(report.layers.repo[0].children[0].path).toBe(join(repo, 'docs', 'a.md'))
    expect(report.startTotal).toBe(42)
  })

  it('follows absolute and ~ imports, from the account CLAUDE.md too', async () => {
    const shared = join(root, 'elsewhere', 'shared.md')
    await put(shared, chars(40))
    await put(join(root, 'home', 'notes.md'), chars(80))
    await put(join(account, 'CLAUDE.md'), `@${shared}\n@~/notes.md\n`)

    const report = await readContext(input())

    expect(report.layers.account[0].children.map((c) => [c.path, c.tokens])).toEqual([
      [shared, 10],
      [join(root, 'home', 'notes.md'), 20]
    ])
  })

  it('counts a file once even when a CLAUDE.md that loads anyway is also imported, and lists a missing import once', async () => {
    await put(join(account, 'CLAUDE.md'), `@${join(root, 'CLAUDE.md')}\n@gone.md\n@gone.md\n`)
    await put(join(root, 'CLAUDE.md'), chars(40))
    await put(join(repo, 'CLAUDE.md'), chars(4))

    const report = await readContext(input())

    expect(report.layers.account[0].children.map((c) => [c.label.startsWith('@gone') ? c.label : 'parent', c.tokens])).toEqual([
      ['parent', 10],
      ['@gone.md', 0]
    ])
    expect(report.layers.repo.map((i) => i.label)).toEqual(['CLAUDE.md'])
    expect(report.missing).toEqual(['claude-local-md'])
  })

  it('follows imports five steps deep and no further', async () => {
    await put(join(repo, 'CLAUDE.md'), '@1.md')
    for (let n = 1; n <= 6; n++) await put(join(repo, `${n}.md`), `@${n + 1}.md`)

    const report = await readContext(input())

    let depth = 0
    for (let item = report.layers.repo[0]; item.children.length; item = item.children[0]) depth++
    expect(depth).toBe(5)
  })

  it('leaves references in code, e-mail addresses and package names in backticks alone', async () => {
    await put(join(repo, 'CLAUDE.md'), 'Mail a@b.com. Use `@types/node`.\n```\n@inside.md\n```\n')

    const report = await readContext(input())

    expect(report.layers.repo[0].children).toEqual([])
  })
})


describe('context reader: subfolder CLAUDE.md files', () => {
  it('lists them in the repo layer without counting them, skipping node_modules', async () => {
    await put(join(repo, 'CLAUDE.md'), chars(4))
    await put(join(repo, 'src', 'ui', 'CLAUDE.md'), chars(4000))
    await put(join(repo, 'node_modules', 'pkg', 'CLAUDE.md'), chars(4000))

    const report = await readContext(input())

    expect(report.layers.repo.map(brief)).toEqual([
      { kind: 'claude-md', label: 'CLAUDE.md', tokens: 1 },
      { kind: 'subfolder-claude-md', label: 'src/ui/CLAUDE.md', tokens: null }
    ])
    expect(report.layers.repo[1].path).toBe(join(repo, 'src', 'ui', 'CLAUDE.md'))
    expect(report.startTotal).toBe(1)
  })

  it('leaves out a folder the repo gitignores', async () => {
    execFileSync('git', ['init', '-q'], { cwd: repo })
    await put(join(repo, '.gitignore'), 'build/\n')
    await put(join(repo, 'build', 'CLAUDE.md'), chars(40))
    await put(join(repo, 'docs', 'CLAUDE.md'), chars(40))

    const report = await readContext(input())

    expect(report.layers.repo.map((i) => i.label)).toEqual(['docs/CLAUDE.md'])
  })
})

describe('context reader: account profiles', () => {
  it('reads the account layer from the workspace profile and marks what it shares with Personal', async () => {
    const work = join(root, 'work')
    await put(join(account, 'CLAUDE.md'), chars(400))
    await fs.mkdir(work)
    await ensureProfileLinks({ defaultDir: account, profileDir: work })
    await put(join(work, 'own.md'), chars(40))
    await fs.appendFile(join(account, 'CLAUDE.md'), '\n@own.md')
    await put(join(repo, 'CLAUDE.md'), chars(4))

    const report = await readContext(input({ configDir: work }))

    const [accountMd] = report.layers.account
    expect(accountMd.path).toBe(join(work, 'CLAUDE.md'))
    expect(accountMd.sharedWithDefault).toBe(true)
    expect(accountMd.children.map((c) => [c.path, c.sharedWithDefault])).toEqual([[join(work, 'own.md'), false]])
    expect(report.layers.repo[0].sharedWithDefault).toBe(false)
    // 408 characters with the import line, then the 40-character import and the repo file.
    expect(report.startTotal).toBe(102 + 10 + 1)
  })

  it('never shares anything when the workspace is on Personal itself', async () => {
    await put(join(account, 'CLAUDE.md'), chars(4))

    const report = await readContext(input())

    expect(report.layers.account[0].sharedWithDefault).toBe(false)
  })

  it('marks every item in an adopted folder read-only, and nothing else', async () => {
    const adopted = join(root, 'vscode-profile')
    await put(join(adopted, 'CLAUDE.md'), '@extra.md')
    await put(join(adopted, 'extra.md'), chars(4))
    await put(join(repo, 'CLAUDE.md'), chars(4))

    const report = await readContext(input({ configDir: adopted, adoptedDirs: [adopted] }))

    const [accountMd] = report.layers.account
    expect(accountMd.readOnly).toBe('adopted folder: the app never writes here')
    expect(accountMd.children[0].readOnly).toBe('adopted folder: the app never writes here')
    expect(report.layers.repo[0].readOnly).toBeNull()
  })
})
