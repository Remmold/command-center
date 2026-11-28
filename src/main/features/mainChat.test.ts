import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claudeArgs } from '../claude/args'
import { proposalSegments } from '../../shared/featureProposal'
import { MAIN_CHAT_INSTRUCTIONS } from '../../shared/mainChatActions'
import { MAIN_CHAT_PANE_ID, READ_ONLY_TOOLS, mainChatFirstPrompt, mainChatLaunch, mainChatReply, type MainChatScope, type PathResolver } from '../../shared/mainChat'

const DATA = 'C:\\Users\\a\\AppData\\Roaming\\cc'
const DIGEST = `${DATA}\\feature-digest\\feature-digest.md`
const WORKTREES = ['C:\\wt\\login', 'C:\\wt\\billing']
const WORKSPACES = ['C:\\projects\\app', 'C:\\projects\\api', 'C:\\wt\\login']
const TEST_FLOWS = 'C:\\projects\\test-flows'
const SCOPE: MainChatScope = {
  digestFile: DIGEST,
  chatDir: `${DATA}\\main-chat`,
  worktrees: WORKTREES,
  workspaces: WORKSPACES,
  testFlowsFolder: TEST_FLOWS,
  fenced: [DATA, 'C:\\Users\\a\\.claude']
}

/** Wording that once made the chat refuse to start a feature. */
const REFUSING = /never act|cannot start|can't start|can not start|you cannot|unable to start|say so if asked|answers? only/i

describe('the main chat process arguments', () => {
  const launch = mainChatLaunch(SCOPE)
  const args = claudeArgs({ paneId: MAIN_CHAT_PANE_ID, cwd: SCOPE.chatDir, addDirs: launch.addDirs, extraArgs: launch.cliArgs })

  it('offers the read tools and nothing that writes or runs', () => {
    const tools = args.find((a) => a.startsWith('--tools='))!.slice('--tools='.length).split(',')
    expect(tools).toEqual([...READ_ONLY_TOOLS])
    for (const banned of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Task', 'Agent', 'Skill']) expect(tools).not.toContain(banned)
  })

  it('names the write and shell tools as denied and drops every MCP server', () => {
    const denied = args.find((a) => a.startsWith('--disallowedTools='))!.split('=')[1].split(',')
    expect(denied).toEqual(expect.arrayContaining(['Write', 'Edit', 'Bash', 'WebFetch']))
    expect(args).toContain('--strict-mcp-config')
  })

  it('loads only the project setting source, so no user-level allow rule can pre-approve a read', () => {
    expect(args).toContain('--setting-sources=project')
    expect(args).not.toContain('user,project,local')
    expect(args.filter((a) => a.startsWith('--setting-sources'))).toHaveLength(1)
  })

  it('appends the role and action rules to the system prompt as one argument, so a resumed chat has them', () => {
    expect(args.filter((a) => a.startsWith('--append-system-prompt'))).toEqual([`--append-system-prompt=${MAIN_CHAT_INSTRUCTIONS}`])
    expect(launch.cliArgs).toHaveLength(5)
  })

  it('reads the digest folder, every feature worktree, every workspace and the test flows, once each, but not its own folder', () => {
    const dirs = args.flatMap((a, i) => (a === '--add-dir' ? [args[i + 1]] : []))
    expect(dirs).toEqual([`${DATA}\\feature-digest`, ...WORKTREES, 'C:\\projects\\app', 'C:\\projects\\api', TEST_FLOWS])
    expect(mainChatLaunch({ ...SCOPE, worktrees: [...WORKTREES, 'c:\\WT\\login\\'] }).addDirs).toHaveLength(6)
  })

  it('leaves out of the added folders a workspace that holds the app data or a Claude folder, so its reads still come to the app', () => {
    expect(mainChatLaunch({ ...SCOPE, workspaces: ['C:\\Users\\a'] }).addDirs).not.toContain('C:\\Users\\a')
    expect(mainChatLaunch({ ...SCOPE, workspaces: [DATA] }).addDirs).not.toContain(DATA)
  })
})

describe('the main chat first prompt and instructions', () => {
  it('names the digest and none of the wording that made it refuse', () => {
    const prompt = mainChatFirstPrompt(DIGEST)
    expect(prompt).toContain(DIGEST)
    expect(prompt).toMatch(/spec, tickets and progress notes/)
    expect(prompt).not.toMatch(REFUSING)
    expect(prompt).not.toMatch(/Just started/)
  })

  it('after a Go, names the feature just started and its workspace in one line', () => {
    const prompt = mainChatFirstPrompt(DIGEST, { name: 'hello-footer', workspace: 'Test' })
    const line = prompt.split('\n').filter((l) => l.startsWith('Just started:'))
    expect(line).toHaveLength(1)
    expect(line[0]).toContain('hello-footer')
    expect(line[0]).toContain('workspace Test')
    expect(prompt).toMatch(/^You are the main chat of Command Center/)
    expect(prompt).not.toMatch(REFUSING)
  })

  it('casts the chat as the orchestrator that acts through cards, and keeps the proposal block format', () => {
    expect(MAIN_CHAT_INSTRUCTIONS).not.toMatch(REFUSING)
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/orchestrator/)
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/turns each action block into a card/)
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/when the user asks you to start a feature, write one feature-proposal block/)
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/never claim to have done it yourself/)
    expect(MAIN_CHAT_INSTRUCTIONS).toContain('````feature-proposal')
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/Open work section lists work no feature tracks/)
    expect(MAIN_CHAT_INSTRUCTIONS).not.toMatch(/not available yet|never offer to adopt/)
    expect(MAIN_CHAT_INSTRUCTIONS).toMatch(/offer to adopt as a feature or to tidy with housekeeping, item by item/)
    expect(proposalSegments(MAIN_CHAT_INSTRUCTIONS).filter((s) => s.kind === 'proposal')).toHaveLength(1)
  })

  it('says it has no write or run tool only for a request to edit a file or run a command, with a proposal offered', () => {
    const lines = MAIN_CHAT_INSTRUCTIONS.split('\n').filter((l) => /no tool/.test(l))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/If the user asks you to edit a file or run a command yourself/)
    expect(lines[0]).toMatch(/offer a feature proposal/)
  })
})

describe('an approval request from the main chat', () => {
  const BS = String.fromCharCode(92)
  const CHAT = 'c:/users/a/appdata/roaming/cc/main-chat'
  const links: Record<string, string> = { 'c:/wt/login/link': 'c:/secrets', 'c:/wt/short~1': 'c:/wt/login' }
  const exists = (p: string): boolean => ['c:/wt/', 'c:/secrets', 'c:/projects/', 'c:/users/'].some((root) => p.startsWith(root))
  const resolve: PathResolver = async (raw) => {
    const flat = raw.split(BS).join('/').toLowerCase()
    const abs = /^[a-z]:/.test(flat) ? flat : `${CHAT}/${flat}`
    let norm = posix.normalize(abs)
    for (const [from, to] of Object.entries(links)) if (norm === from || norm.startsWith(`${from}/`)) norm = to + norm.slice(from.length)
    return exists(norm) ? norm : null
  }
  const behavior = async (tool: string, input: Record<string, unknown>, scope: MainChatScope = SCOPE): Promise<string> => (await mainChatReply(tool, input, scope, resolve)).behavior

  it('allows a read inside a worktree, a workspace, the test flows and the digest folder', async () => {
    expect(await behavior('Read', { file_path: 'C:/wt/login/.scratch/login/spec.md' })).toBe('allow')
    expect(await behavior('Grep', { pattern: 'x', path: 'c:' + BS + 'WT' + BS + 'billing' })).toBe('allow')
    expect(await behavior('Read', { file_path: 'C:/projects/app/src/index.ts' })).toBe('allow')
    expect(await behavior('Glob', { path: 'C:/projects/api', pattern: '**/*.md' })).toBe('allow')
    expect(await behavior('Read', { file_path: 'C:/projects/test-flows/app/login.md' })).toBe('allow')
    expect(await behavior('Read', { file_path: `${DATA}/feature-digest/feature-digest.md` })).toBe('allow')
  })

  it('refuses the rest of the app data and the Claude folder: profiles, tokens, app list, its own saved state', async () => {
    for (const file of ['profiles.json', 'apps.json', 'main-chat.json', 'profiles/work/.credentials.json']) expect(await behavior('Read', { file_path: `${DATA}/${file}` })).toBe('deny')
    expect(await behavior('Read', { file_path: 'C:/Users/a/.claude/.credentials.json' })).toBe('deny')
    expect(await behavior('Grep', { pattern: 'token', path: DATA })).toBe('deny')
  })

  it('keeps the fence when a workspace holds it: the home folder as a workspace still hides its Claude folder', async () => {
    const home: MainChatScope = { ...SCOPE, workspaces: ['C:/Users/a'] }
    expect(await behavior('Read', { file_path: 'C:/Users/a/notes.md' }, home)).toBe('allow')
    expect(await behavior('Read', { file_path: 'C:/Users/a/.claude/.credentials.json' }, home)).toBe('deny')
    expect(await behavior('Read', { file_path: `${DATA}/profiles.json` }, home)).toBe('deny')
    expect(await behavior('Grep', { pattern: 'x', path: 'C:/Users/a' }, home)).toBe('deny')
  })

  it('covers a workspace added after the process started, since the scope is read for each request', async () => {
    const file = { file_path: 'C:/projects/new-one/README.md' }
    expect(await behavior('Read', file)).toBe('deny')
    expect(await behavior('Read', file, { ...SCOPE, workspaces: [...WORKSPACES, 'C:/projects/new-one'] })).toBe('allow')
  })

  it('refuses a read outside the roots, a bare call, and a sibling folder that only shares a prefix', async () => {
    expect(await behavior('Read', { file_path: 'C:/secrets/a.txt' })).toBe('deny')
    expect(await behavior('Read', {})).toBe('deny')
    expect(await behavior('Glob', { pattern: '*.md' })).toBe('deny')
    expect(await behavior('Read', { file_path: 'C:/wt/login-old/a.md' })).toBe('deny')
    expect(await behavior('Read', { file_path: 'C:/projects/application/a.md' })).toBe('deny')
  })

  it('refuses a path that climbs out with .. or leaves through a link or a short name', async () => {
    expect(await behavior('Read', { file_path: 'C:/wt/login/../../secrets/a.txt' })).toBe('deny')
    expect(await behavior('Read', { file_path: 'C:/wt/login/link/a.txt' })).toBe('deny')
    expect(await behavior('Read', { file_path: 'C:/wt/short~1/spec.md' })).toBe('allow')
    expect(await behavior('Read', { file_path: 'C:/wt/missing/../../secrets/a.txt' })).toBe('deny')
  })

  it('resolves a relative path against the chat folder, which is a root', async () => {
    expect(await behavior('Read', { file_path: 'notes.md' })).toBe('allow')
    expect(await behavior('Read', { file_path: '../profiles.json' })).toBe('deny')
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
