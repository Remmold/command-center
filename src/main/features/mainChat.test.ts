import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claudeArgs } from '../claude/args'
import { MAIN_CHAT_PANE_ID, READ_ONLY_TOOLS, mainChatFirstPrompt, mainChatLaunch, mainChatReply, type PathResolver } from '../../shared/mainChat'

const DATA = 'C:\\Users\\a\\AppData\\Roaming\\cc'
const DIGEST = `${DATA}\\feature-digest\\feature-digest.md`
const WORKTREES = ['C:\\wt\\login', 'C:\\wt\\billing']

describe('the main chat process arguments', () => {
  const launch = mainChatLaunch(DIGEST, WORKTREES)
  const args = claudeArgs({ paneId: MAIN_CHAT_PANE_ID, cwd: 'C:\\cc\\main-chat', addDirs: launch.addDirs, extraArgs: launch.cliArgs })

  it('offers the read tools and nothing that writes or runs', () => {
    const tools = args.find((a) => a.startsWith('--tools='))!.slice('--tools='.length).split(',')
    expect(tools).toEqual([...READ_ONLY_TOOLS])
    for (const banned of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Task', 'Agent', 'Skill']) expect(tools).not.toContain(banned)
  })

  it('names the write and shell tools as denied and drops every MCP server', () => {
    const denied = args.find((a) => a.startsWith('--disallowedTools='))!.split('=')[1].split(',')
    expect(denied).toEqual(expect.arrayContaining(['Write', 'Edit', 'Bash']))
    expect(args).toContain('--strict-mcp-config')
  })

  it('loads only the project setting source, so no user-level allow rule can pre-approve a read', () => {
    expect(args).toContain('--setting-sources=project')
    expect(args).not.toContain('user,project,local')
    expect(args.filter((a) => a.startsWith('--setting-sources'))).toHaveLength(1)
  })

  it('reads the digest folder and every feature worktree, once each', () => {
    const dirs = args.flatMap((a, i) => (a === '--add-dir' ? [args[i + 1]] : []))
    expect(dirs).toEqual([`${DATA}\\feature-digest`, ...WORKTREES])
    expect(mainChatLaunch(DIGEST, [...WORKTREES, 'c:\\WT\\login\\']).addDirs).toHaveLength(3)
  })
})

describe('the main chat first prompt', () => {
  it('names the digest and says it answers only', () => {
    const prompt = mainChatFirstPrompt(DIGEST)
    expect(prompt).toContain(DIGEST)
    expect(prompt).toMatch(/answer/i)
    expect(prompt).toMatch(/spec, tickets and progress notes/)
  })
})

describe('an approval request from the main chat', () => {
  const BS = String.fromCharCode(92)
  const CHAT = 'c:/cc/main-chat'
  const links: Record<string, string> = { 'c:/wt/login/link': 'c:/secrets', 'c:/wt/short~1': 'c:/wt/login' }
  const exists = (p: string): boolean => p.startsWith('c:/wt/') || p.startsWith('c:/cc/') || p.startsWith('c:/secrets') || p.startsWith('c:/data/')
  const resolve: PathResolver = async (raw) => {
    const flat = raw.split(BS).join('/').toLowerCase()
    const abs = /^[a-z]:/.test(flat) ? flat : `${CHAT}/${flat}`
    let norm = posix.normalize(abs)
    for (const [from, to] of Object.entries(links)) if (norm === from || norm.startsWith(`${from}/`)) norm = to + norm.slice(from.length)
    return exists(norm) ? norm : null
  }
  const roots = ['C:/data/feature-digest', 'C:/cc/main-chat', 'C:/WT/login', 'C:/wt/billing']
  const behavior = async (tool: string, input: Record<string, unknown>): Promise<string> => (await mainChatReply(tool, input, roots, resolve)).behavior

  it('allows a read inside a worktree, including one made after the process started', async () => {
    expect(await behavior('Read', { file_path: 'C:/wt/login/.scratch/login/spec.md' })).toBe('allow')
    expect(await behavior('Grep', { pattern: 'x', path: 'c:' + BS + 'WT' + BS + 'billing' })).toBe('allow')
    expect(await behavior('Read', { file_path: 'C:/data/feature-digest/feature-digest.md' })).toBe('allow')
  })

  it('refuses a read outside the roots, a bare call, and a sibling folder that only shares a prefix', async () => {
    expect(await behavior('Read', { file_path: 'C:/secrets/a.txt' })).toBe('deny')
    expect(await behavior('Read', {})).toBe('deny')
    expect(await behavior('Glob', { pattern: '*.md' })).toBe('deny')
    expect(await behavior('Read', { file_path: 'C:/wt/login-old/a.md' })).toBe('deny')
  })

  it('refuses a path that climbs out with .. or leaves through a link or a short name', async () => {
    expect(await behavior('Read', { file_path: 'C:/wt/login/../../secrets/a.txt' })).toBe('deny')
    expect(await behavior('Read', { file_path: 'C:/wt/login/link/a.txt' })).toBe('deny')
    expect(await behavior('Read', { file_path: 'C:/wt/short~1/spec.md' })).toBe('allow')
    expect(await behavior('Read', { file_path: 'C:/wt/missing/../../secrets/a.txt' })).toBe('deny')
  })

  it('resolves a relative path against the chat folder, which is a root', async () => {
    expect(await behavior('Read', { file_path: 'notes.md' })).toBe('allow')
    expect(await behavior('Read', { file_path: '../../secrets/a.txt' })).toBe('deny')
  })

  it('refuses a Glob pattern or Grep glob that climbs or is absolute, even with a path inside a root', async () => {
    const inside = 'C:/wt/login'
    expect(await behavior('Glob', { path: inside, pattern: '../../secrets/*' })).toBe('deny')
    expect(await behavior('Glob', { path: inside, pattern: 'C:/secrets/*' })).toBe('deny')
    expect(await behavior('Glob', { path: inside, pattern: BS + 'secrets' + BS + '*' })).toBe('deny')
    expect(await behavior('Grep', { path: inside, pattern: 'x', glob: '../**' })).toBe('deny')
    expect(await behavior('Grep', { path: inside, pattern: 'x', glob: '/etc/*' })).toBe('deny')
    expect(await behavior('Glob', { path: inside, pattern: 'src/**/*.ts' })).toBe('allow')
    expect(await behavior('Grep', { path: inside, pattern: '..', glob: '*.md' })).toBe('allow')
  })

  it.each(['Write', 'Edit', 'Bash', 'WebFetch', 'mcp__x__y', 'Task'])('refuses %s whatever its input', async (tool) => {
    expect(await behavior(tool, { file_path: 'C:/wt/login/a.md', command: 'ls' })).toBe('deny')
  })
})
