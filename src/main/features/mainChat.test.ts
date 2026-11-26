import { describe, expect, it } from 'vitest'
import { claudeArgs } from '../claude/args'
import { MAIN_CHAT_PANE_ID, READ_ONLY_TOOLS, mainChatFirstPrompt, mainChatLaunch, mainChatReply } from '../../shared/mainChat'

const DATA = 'C:\\Users\\a\\AppData\\Roaming\\cc'
const DIGEST = `${DATA}\\feature-digest.md`
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

  it('reads the digest folder and every feature worktree, once each', () => {
    const dirs = args.flatMap((a, i) => (a === '--add-dir' ? [args[i + 1]] : []))
    expect(dirs).toEqual([DATA, ...WORKTREES])
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
  const roots = [DATA, ...WORKTREES]
  const behavior = (tool: string, input: Record<string, unknown>): string => mainChatReply(tool, input, roots).behavior

  it('allows a read inside a worktree, including one made after the process started', () => {
    expect(behavior('Read', { file_path: 'C:\\wt\\login\\.scratch\\login\\spec.md' })).toBe('allow')
    expect(behavior('Grep', { pattern: 'x', path: 'c:/WT/billing' })).toBe('allow')
  })

  it('refuses a read outside the roots, a bare Read, and a sibling folder that only shares a prefix', () => {
    expect(behavior('Read', { file_path: 'C:\\secrets\\a.txt' })).toBe('deny')
    expect(behavior('Read', {})).toBe('deny')
    expect(behavior('Read', { file_path: 'C:\\wt\\login-old\\a.md' })).toBe('deny')
  })

  it.each(['Write', 'Edit', 'Bash', 'WebFetch', 'mcp__x__y', 'Task'])('refuses %s whatever its input', (tool) => {
    expect(behavior(tool, { file_path: 'C:\\wt\\login\\a.md', command: 'ls' })).toBe('deny')
  })
})
