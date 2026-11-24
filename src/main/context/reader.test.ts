import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ContextItem } from '../../shared/context'
import { ensureProfileLinks } from '../profiles/linker'
import { sanitizeCwd } from '../profiles/transcripts'
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

const memoryDir = (configDir: string): string => join(configDir, 'projects', sanitizeCwd(repo), 'memory')

describe('context reader: memory', () => {
  it("lists the workspace's memory folder in the account layer, counting MEMORY.md and listing the other files", async () => {
    await put(join(memoryDir(account), 'MEMORY.md'), chars(200))
    await put(join(memoryDir(account), 'user_role.md'), chars(4000))
    await put(join(memoryDir(account), 'env_quirk.md'), chars(4000))
    await put(join(account, 'projects', sanitizeCwd(join(root, 'other')), 'memory', 'MEMORY.md'), chars(4000))

    const report = await readContext(input())

    expect(report.layers.account.map(brief)).toEqual([
      { kind: 'memory-index', label: 'MEMORY.md', tokens: 50 },
      { kind: 'memory-file', label: 'env_quirk.md', tokens: null },
      { kind: 'memory-file', label: 'user_role.md', tokens: null }
    ])
    expect(report.layers.account[0].path).toBe(join(memoryDir(account), 'MEMORY.md'))
    expect(report.startTotal).toBe(50)
  })
})

/** A skill or agent file whose name and description add up to a known number of characters, with a long body that doesn't count. */
const described = (name: string | null, description: string): string =>
  `---\n${name === null ? '' : `name: ${name}\n`}description: ${description}\nallowed-tools: Read\n---\n\n${chars(8000)}\n`

describe('context reader: skills, agents and commands', () => {
  it('lists the account ones, counting only the name and description of skills and agents', async () => {
    // "tdd" + 37 characters = 40 → 10.
    await put(join(account, 'skills', 'tdd', 'SKILL.md'), described('tdd', chars(37)))
    // No name in the frontmatter: the folder's name, "flow" + a quoted 36 = 40 → 10.
    await put(join(account, 'skills', 'flow', 'SKILL.md'), described(null, `"${chars(31)} \\"q\\" "`))
    // A folder without SKILL.md is not a skill.
    await put(join(account, 'skills', 'synced', 'notes.md'), chars(400))
    // "reviewer" + a folded description of 6 + 1 + 5 = 20 → 5.
    await put(join(account, 'agents', 'reviewer.md'), `---\nname: reviewer\ndescription: >\n  ${chars(6)}\n  ${chars(5)}\ntools: Read\n---\n${chars(4000)}`)
    await put(join(account, 'commands', 'ship.md'), `---\ndescription: Ship it\n---\n${chars(4000)}`)
    await put(join(account, 'commands', 'git', 'push.md'), chars(400))

    const report = await readContext(input())

    expect(report.layers.account.map(brief)).toEqual([
      { kind: 'skill', label: 'flow', tokens: 10 },
      { kind: 'skill', label: 'tdd', tokens: 10 },
      { kind: 'agent', label: 'reviewer', tokens: 5 },
      { kind: 'command', label: 'git:push', tokens: null },
      { kind: 'command', label: 'ship', tokens: null }
    ])
    expect(report.layers.account.map((i) => i.source)).toEqual(['account', 'account', 'account', 'account', 'account'])
    expect(report.layers.account[1].path).toBe(join(account, 'skills', 'tdd', 'SKILL.md'))
    expect(report.startTotal).toBe(25)
  })

  it("lists the repo's own in the repo layer after its CLAUDE.md files, sourced repo", async () => {
    await put(join(repo, 'CLAUDE.md'), chars(4))
    // "lint" + 16 = 20 → 5.
    await put(join(repo, '.claude', 'skills', 'lint', 'SKILL.md'), described('lint', chars(16)))
    // "db" + 6 = 8 → 2.
    await put(join(repo, '.claude', 'agents', 'db.md'), described('db', chars(6)))
    await put(join(repo, '.claude', 'commands', 'seed.md'), chars(400))
    await put(join(repo, 'src', 'CLAUDE.md'), chars(4))

    const report = await readContext(input())

    expect(report.layers.repo.map(brief)).toEqual([
      { kind: 'claude-md', label: 'CLAUDE.md', tokens: 1 },
      { kind: 'skill', label: 'lint', tokens: 5 },
      { kind: 'agent', label: 'db', tokens: 2 },
      { kind: 'command', label: 'seed', tokens: null },
      { kind: 'subfolder-claude-md', label: 'src/CLAUDE.md', tokens: null }
    ])
    expect(report.layers.repo.slice(1, 4).map((i) => i.source)).toEqual(['repo', 'repo', 'repo'])
    expect(report.layers.account).toEqual([])
    expect(report.startTotal).toBe(8)
  })
})

/** A plugin in the profile's cache, recorded in installed_plugins.json the way Claude Code records it. */
async function installPlugin(configDir: string, key: string, version: string, files: Record<string, string>, manifest: object | null = {}): Promise<string> {
  const [name, marketplace] = key.split('@')
  const dir = join(configDir, 'plugins', 'cache', marketplace, name, version)
  if (manifest) await put(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version, ...manifest }))
  for (const [rel, text] of Object.entries(files)) await put(join(dir, rel), text)
  const registry = join(configDir, 'plugins', 'installed_plugins.json')
  const current = JSON.parse((await fs.readFile(registry, 'utf-8').catch(() => null)) ?? '{"version":2,"plugins":{}}')
  current.plugins[key] = [{ scope: 'user', installPath: dir, version, installedAt: '2026-11-17T16:39:53.664Z' }]
  await put(registry, JSON.stringify(current, null, 2))
  return dir
}

describe('context reader: plugins', () => {
  it("lists every layer's enabled plugins with their skills, agents and commands from the cache, sourced plugin:<name>", async () => {
    await put(join(account, 'settings.json'), JSON.stringify({ enabledPlugins: { 'review-kit@market': true, 'old-kit@official': false } }))
    await put(join(repo, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'lint-kit@market': true } }))
    await put(join(repo, '.claude', 'settings.local.json'), JSON.stringify({ enabledPlugins: { 'review-kit@market': true } }))
    const review = await installPlugin(
      account,
      'review-kit@market',
      '1.3.2',
      {
        // "tdd" + 17 = 20 → 5; only the manifest's path reaches it.
        'skills/engineering/tdd/SKILL.md': described('tdd', chars(17)),
        // "grill" + 15 = 20 → 5, in the default folder.
        'skills/grill/SKILL.md': described('grill', chars(15)),
        // "critic" + 6 = 12 → 3.
        'agents/critic.md': described('critic', chars(6)),
        'commands/review.md': chars(400)
      },
      { skills: ['./skills/engineering/tdd'] }
    )
    // An older version left in the cache is not the installed one.
    await put(join(account, 'plugins', 'cache', 'market', 'review-kit', '1.3.1', 'skills', 'stale', 'SKILL.md'), described('stale', chars(400)))
    await installPlugin(account, 'old-kit@official', '1.0.0', { 'skills/old/SKILL.md': described('old', chars(400)) })
    // No manifest: the name before the @ is the plugin's name. "fix" + 1 = 4 → 1.
    await installPlugin(account, 'lint-kit@market', '2.0.0', { 'skills/fix/SKILL.md': described('fix', chars(1)) }, null)

    const report = await readContext(input())

    expect(report.layers.account.map(brief)).toEqual([
      {
        kind: 'plugin',
        label: 'review-kit@market',
        tokens: null,
        children: [
          { kind: 'skill', label: 'grill', tokens: 5 },
          { kind: 'skill', label: 'tdd', tokens: 5 },
          { kind: 'agent', label: 'critic', tokens: 3 },
          { kind: 'command', label: 'review', tokens: null }
        ]
      }
    ])
    const [plugin] = report.layers.account
    expect(plugin.path).toBe(join(review, '.claude-plugin', 'plugin.json'))
    expect(plugin.source).toBe('account')
    expect(plugin.children.map((c) => c.source)).toEqual(['plugin:review-kit', 'plugin:review-kit', 'plugin:review-kit', 'plugin:review-kit'])
    expect(plugin.children[1].path).toBe(join(review, 'skills', 'engineering', 'tdd', 'SKILL.md'))
    expect(report.layers.repo.map(brief)).toEqual([
      { kind: 'plugin', label: 'lint-kit@market', tokens: null, children: [{ kind: 'skill', label: 'fix', tokens: 1 }] }
    ])
    expect(report.layers.repo[0].children[0].source).toBe('plugin:lint-kit')
    expect(report.layers.repo[0].path).toBeNull()
    // Enabled again in the local layer: listed there too, its contents counted once.
    expect(report.layers.local.map(brief)).toEqual([{ kind: 'plugin', label: 'review-kit@market', tokens: null }])
    expect(report.startTotal).toBe(5 + 5 + 3 + 1)
  })

  it('leaves out a plugin a later layer turns off, and shows an enabled one that is not installed as not found', async () => {
    await put(join(account, 'settings.json'), JSON.stringify({ enabledPlugins: { 'review-kit@market': true, 'ghost@market': true } }))
    await put(join(repo, '.claude', 'settings.local.json'), JSON.stringify({ enabledPlugins: { 'review-kit@market': false } }))
    await installPlugin(account, 'review-kit@market', '1.0.0', { 'skills/grill/SKILL.md': described('grill', chars(15)) })

    const report = await readContext(input())

    expect(report.layers.account.map(brief)).toEqual([{ kind: 'plugin', label: 'ghost@market', tokens: null, missing: true }])
    expect(report.layers.local).toEqual([])
    expect(report.startTotal).toBe(0)
  })
})

describe('context reader: memory and plugins on a linked profile', () => {
  it("reads them through the Work profile's links and marks them shared with Personal", async () => {
    const work = join(root, 'work')
    await put(join(memoryDir(account), 'MEMORY.md'), chars(40))
    await put(join(memoryDir(account), 'notes.md'), chars(40))
    await put(join(account, 'settings.json'), JSON.stringify({ enabledPlugins: { 'review-kit@market': true } }))
    await installPlugin(account, 'review-kit@market', '1.0.0', { 'skills/grill/SKILL.md': described('grill', chars(15)) })
    await fs.mkdir(work)
    await ensureProfileLinks({ defaultDir: account, profileDir: work })

    const report = await readContext(input({ configDir: work }))

    expect(report.layers.account.map((i) => [i.kind, i.path, i.sharedWithDefault])).toEqual([
      ['memory-index', join(memoryDir(work), 'MEMORY.md'), true],
      ['memory-file', join(memoryDir(work), 'notes.md'), true],
      ['plugin', join(work, 'plugins', 'cache', 'market', 'review-kit', '1.0.0', '.claude-plugin', 'plugin.json'), true]
    ])
    expect(report.layers.account[2].children.map((c) => [c.label, c.sharedWithDefault])).toEqual([['grill', true]])
    expect(report.startTotal).toBe(10 + 5)
  })
})

describe('context reader: edge cases of skills and plugins', () => {
  it('still lists a skill that a CLAUDE.md also imports', async () => {
    await put(join(account, 'CLAUDE.md'), '@skills/tdd/SKILL.md')
    await put(join(account, 'skills', 'tdd', 'SKILL.md'), described('tdd', chars(17)))

    const report = await readContext(input())

    expect(report.layers.account.map((i) => [i.kind, i.label])).toEqual([
      ['claude-md', 'CLAUDE.md'],
      ['skill', 'tdd']
    ])
  })

  it('reads the newest cached version of an enabled plugin that installed_plugins.json does not record', async () => {
    await put(join(account, 'settings.json'), JSON.stringify({ enabledPlugins: { 'kit@market': true } }))
    const cache = join(account, 'plugins', 'cache', 'market', 'kit')
    await put(join(cache, '1.9.0', 'skills', 'old', 'SKILL.md'), described('old', chars(1)))
    await put(join(cache, '1.10.0', 'skills', 'new', 'SKILL.md'), described('new', chars(1)))

    const report = await readContext(input())

    expect(report.layers.account[0].children.map((c) => c.label)).toEqual(['new'])
  })
})

