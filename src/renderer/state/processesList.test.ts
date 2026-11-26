import { describe, expect, it } from 'vitest'
import type { BackgroundProcess } from '../../shared/backgroundProcesses'
import type { TerminalInfo, Workspace } from '../../shared/types'
import { claudeRowKey, processesList, selectedRowKey, terminalRowKey, terminalRunKey, type ProcessesListInput } from './processesList'

const workspace = (id: string, repoName: string, worktreeTag = ''): Workspace => ({
  id,
  name: worktreeTag ? `${repoName}-${worktreeTag}` : repoName,
  path: `C:/src/${id}`,
  createdAt: 0,
  profileId: 'default',
  repoGroupKey: `key-${repoName}`,
  repoName,
  worktreeTag
})

const WORKSPACES = [workspace('cc', 'command-center'), workspace('mm', 'mmorpg', 'shard-2')]

const claude = (taskId: string, command: string, startedAt: number, status: BackgroundProcess['status'] = 'running'): BackgroundProcess => ({
  taskId,
  command,
  status,
  startedAt,
  ...(status === 'running' ? {} : { endedAt: startedAt + 10 })
})

const terminal = (id: string, label: string, startedAt: number, over: Partial<TerminalInfo> = {}): TerminalInfo => ({
  id,
  workspaceId: 'cc',
  cwd: 'C:/src/cc',
  label,
  kind: 'pwsh',
  status: 'running',
  startedAt,
  ...over
})

function input(over: Partial<ProcessesListInput>): ProcessesListInput {
  return {
    workspaces: WORKSPACES,
    identities: {},
    sessions: [
      { paneId: 'p1', workspaceId: 'cc', title: 'Fix the login' },
      { paneId: 'p2', workspaceId: 'mm', title: 'Shard balance' }
    ],
    claude: {},
    claudeServers: {},
    terminals: [],
    terminalServers: {},
    ...over
  }
}

const shape = (list: ReturnType<typeof processesList>) => list.map((g) => [g.name, g.rows.map((r) => `${r.name} (${r.owner}, ${r.status})`)])

describe('Processes view list', () => {
  it("groups Claude's processes and terminals by workspace, in the workspaces' order, leaving out empty ones", () => {
    const list = processesList(
      input({
        claude: { p2: [claude('t1', 'cargo watch', 5)], p1: [claude('t2', 'pnpm dev', 3)] },
        terminals: [terminal('a', 'pwsh', 4)]
      })
    )
    expect(shape(list)).toEqual([
      ['command-center', ['pwsh (You, Running)', 'pnpm dev (Fix the login, Running)']],
      ['mmorpg · shard-2', ['cargo watch (Shard balance, Running)']]
    ])
  })

  it("names a group by its repo's display name", () => {
    const list = processesList(input({ terminals: [terminal('a', 'pwsh', 1)], identities: { 'key-command-center': { displayName: 'CC' } } }))
    expect(list.map((g) => [g.name, g.repoGroupKey, g.repoName])).toEqual([['CC', 'key-command-center', 'command-center']])
  })

  it('puts running rows first, ended ones below, newest first within each', () => {
    const list = processesList(
      input({
        claude: { p1: [claude('old', 'old build', 1, 'finished'), claude('srv', 'pnpm dev', 2), claude('new', 'new build', 8, 'failed')] },
        terminals: [terminal('a', 'tsc --watch', 5), terminal('b', 'pnpm test', 9, { status: 'exited', exitCode: 1, endedAt: 12 }), terminal('c', 'pwsh', 7)]
      })
    )
    expect(list[0].rows.map((r) => r.name)).toEqual(['pwsh', 'tsc --watch', 'pnpm dev', 'pnpm test', 'new build', 'old build'])
  })

  it('reads each status as Running, Finished, Failed, Stopped or Exited with its code', () => {
    const list = processesList(
      input({
        claude: { p1: [claude('f', 'a', 1, 'finished'), claude('x', 'b', 2, 'failed'), claude('s', 'c', 3, 'stopped')] },
        terminals: [terminal('e', 'd', 4, { status: 'exited', exitCode: 2 }), terminal('k', 'e', 5, { status: 'exited' })]
      })
    )
    expect(list[0].rows.map((r) => [r.name, r.status, r.tone])).toEqual([
      ['e', 'Stopped', 'failed'],
      ['d', 'Exited (2)', 'failed'],
      ['c', 'Stopped', 'failed'],
      ['b', 'Failed', 'failed'],
      ['a', 'Finished', 'ok']
    ])
    const fine = processesList(input({ terminals: [terminal('z', 'pnpm build', 1, { status: 'exited', exitCode: 0 }), terminal('r', 'pwsh', 2)] }))
    expect(fine[0].rows.map((r) => [r.status, r.tone, r.running])).toEqual([
      ['Running', 'running', true],
      ['Exited (0)', 'ok', false]
    ])
  })

  it("lists a Claude process only while its session is known, and a terminal of a removed workspace under its folder's name", () => {
    const list = processesList(
      input({
        claude: { gone: [claude('t1', 'pnpm dev', 1)] },
        terminals: [terminal('a', 'pwsh', 1, { workspaceId: 'removed', cwd: 'C:\\src\\old-repo' })]
      })
    )
    expect(shape(list)).toEqual([['old-repo', ['pwsh (You, Running)']]])
  })

  it('shows the servers of running rows only: answering ones for Claude, and for terminals the ones confirmed to answer', () => {
    const vite = { port: 5173, url: 'http://localhost:5173' }
    const api = { port: 8080, url: 'http://localhost:8080' }
    const list = processesList(
      input({
        claude: { p1: [claude('srv', 'pnpm dev', 1)] },
        claudeServers: { p1: { srv: [vite] } },
        terminals: [
          terminal('a', 'pnpm api', 2, { servers: [api, vite] }),
          terminal('b', 'pnpm old', 3, { status: 'exited', exitCode: 0, servers: [api] }),
          terminal('c', 'restarted', 4),
          terminal('d', 'restarted with the same port', 5, { servers: [api] })
        ],
        terminalServers: { 'a:2': [api], 'b:3': [api], 'c:4': [api], 'd:1': [api] }
      })
    )
    expect(list[0].rows.map((r) => [r.name, r.servers.map((s) => s.port)])).toEqual([
      ['restarted with the same port', []],
      ['restarted', []],
      ['pnpm api', [8080]],
      ['pnpm dev', [5173]],
      ['pnpm old', []]
    ])
  })

  it("keys a terminal's answering servers by its run", () => {
    expect(terminalRunKey({ id: 'a', startedAt: 2 })).toBe('a:2')
  })

  it('carries what a row needs to act on it', () => {
    const list = processesList(input({ claude: { p1: [claude('srv', 'pnpm dev', 1)] }, terminals: [terminal('a', 'pwsh', 2)] }))
    expect(list[0].rows).toMatchObject([
      { key: terminalRowKey('a'), source: 'terminal', terminalId: 'a', workspaceId: 'cc', startedAt: 2 },
      { key: claudeRowKey('p1', 'srv'), source: 'claude', paneId: 'p1', taskId: 'srv', startedAt: 1 }
    ])
  })
})

describe('Processes view selection', () => {
  const list = processesList(
    input({
      claude: { p1: [claude('done', 'build', 9, 'finished')], p2: [claude('srv', 'cargo watch', 5)] },
      terminals: [terminal('b', 'pnpm test', 8, { status: 'exited', exitCode: 0 })]
    })
  )

  it('keeps the chosen row while it is listed', () => {
    expect(selectedRowKey(list, claudeRowKey('p1', 'done'))).toBe(claudeRowKey('p1', 'done'))
  })

  it('picks the first running row when nothing is chosen or the chosen row is gone', () => {
    expect(selectedRowKey(list, null)).toBe(claudeRowKey('p2', 'srv'))
    expect(selectedRowKey(list, terminalRowKey('closed'))).toBe(claudeRowKey('p2', 'srv'))
  })

  it('picks nothing when nothing runs and nothing is chosen', () => {
    const ended = processesList(input({ terminals: [terminal('b', 'pnpm test', 8, { status: 'exited', exitCode: 0 })] }))
    expect(selectedRowKey(ended, null)).toBeNull()
    expect(selectedRowKey([], null)).toBeNull()
  })
})
