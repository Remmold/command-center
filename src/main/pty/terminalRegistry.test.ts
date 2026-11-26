import { beforeEach, describe, expect, it } from 'vitest'
import { PtyManager, type PtyHandle, type PtySpawn } from './manager'
import { shellArgs } from './shell-locator'
import { TAIL_LIMIT, TerminalRegistry } from './terminalRegistry'
import type { TerminalInfo } from '../../shared/types'

class FakePty implements PtyHandle {
  readonly written: string[] = []
  killed = false
  private dataCbs: ((d: string) => void)[] = []
  private exitCbs: ((e: { exitCode: number; signal?: number }) => void)[] = []
  constructor(
    readonly pid: number,
    readonly file: string,
    readonly args: string[],
    readonly env: Record<string, string>
  ) {}
  onData(cb: (d: string) => void) {
    this.dataCbs.push(cb)
    return { dispose: () => undefined }
  }
  onExit(cb: (e: { exitCode: number; signal?: number }) => void) {
    this.exitCbs.push(cb)
    return { dispose: () => undefined }
  }
  write(data: string) {
    this.written.push(data)
  }
  resize() {}
  kill() {
    this.killed = true
  }
  emit(data: string) {
    for (const cb of this.dataCbs) cb(data)
  }
  exit(exitCode: number) {
    for (const cb of this.exitCbs) cb({ exitCode })
  }
}

let spawned: FakePty[]
let treeKilled: number[]
let clock: number
let registry: TerminalRegistry
let changes: TerminalInfo[][]

const last = (): FakePty => spawned[spawned.length - 1]
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  spawned = []
  treeKilled = []
  clock = 1000
  const spawn: PtySpawn = (file, args, options) => {
    const p = new FakePty(100 + spawned.length, file, args, options.env)
    spawned.push(p)
    return p
  }
  const ptys = new PtyManager({
    spawn,
    locate: (kind, cwd, command) => ({ command: kind, args: shellArgs(kind, cwd, command) }),
    killTree: async (pid) => {
      treeKilled.push(pid)
    }
  })
  registry = new TerminalRegistry(ptys, () => clock)
  changes = []
  registry.onChanged((list) => changes.push(list))
})

const create = (extra: Partial<Parameters<TerminalRegistry['create']>[0]> = {}) =>
  registry.create({ workspaceId: 'ws1', cwd: 'C:\\repo', kind: 'pwsh', ...extra })

describe('TerminalRegistry', () => {
  it('creates a plain shell when there is no command, listed as running', () => {
    const res = create({ id: 't1' })
    expect(res.ok).toBe(true)
    expect(last().args).toEqual(['-NoLogo', '-WorkingDirectory', 'C:\\repo'])
    expect(registry.list()).toEqual([
      { id: 't1', workspaceId: 'ws1', cwd: 'C:\\repo', label: 'pwsh', kind: 'pwsh', status: 'running', startedAt: 1000 }
    ])
    expect(changes.at(-1)).toEqual(registry.list())
  })

  it("runs a command through each shell's run-a-command form", () => {
    create({ kind: 'pwsh', command: 'pnpm dev' })
    expect(last().args.slice(-2)).toEqual(['-Command', 'pnpm dev'])
    create({ kind: 'powershell', command: 'pnpm dev' })
    expect(last().args).toEqual(['-NoLogo', '-Command', "Set-Location -LiteralPath 'C:\\repo'; pnpm dev"])
    create({ kind: 'cmd', command: 'pnpm dev' })
    expect(last().args).toEqual(['/c', 'cd /D "C:\\repo" && pnpm dev'])
    create({ kind: 'bash', command: 'pnpm dev' })
    expect(last().args).toEqual(['--login', '-c', "cd 'C:\\repo' && pnpm dev"])
  })

  it('names a command terminal after its command and numbers plain shells per workspace', () => {
    expect(create({ command: 'pnpm dev' }).terminal?.label).toBe('pnpm dev')
    expect(create().terminal?.label).toBe('pwsh')
    expect(create().terminal?.label).toBe('pwsh 2')
    expect(create({ workspaceId: 'ws2' }).terminal?.label).toBe('pwsh')
    expect(create({ kind: 'cmd' }).terminal?.label).toBe('cmd')
  })

  it("passes an account's environment to the shell and keeps it", () => {
    create({ id: 't1', env: { CLAUDE_CONFIG_DIR: 'C:\\p\\work' } })
    expect(last().env.CLAUDE_CONFIG_DIR).toBe('C:\\p\\work')
    expect(registry.list()[0].env).toEqual({ CLAUDE_CONFIG_DIR: 'C:\\p\\work' })
  })

  it('marks a terminal exited with its code when its process ends, and keeps it listed', () => {
    create({ id: 't1', command: 'pnpm build' })
    last().emit('done\r\n')
    clock = 5000
    last().exit(2)
    expect(registry.list()[0]).toMatchObject({ id: 't1', status: 'exited', exitCode: 2, endedAt: 5000 })
    expect(registry.attach('t1')?.tail).toBe('done\r\n')
    expect(changes.at(-1)?.[0].status).toBe('exited')
  })

  it('replays the output tail on attach, then streams live data', () => {
    const live: [string, string][] = []
    registry.onData((id, data) => live.push([id, data]))
    create({ id: 't1' })
    last().emit('PS> ')
    last().emit('echo hi\r\n')
    expect(registry.attach('t1')).toEqual({ terminal: registry.list()[0], tail: 'PS> echo hi\r\n' })
    last().emit('hi\r\n')
    expect(live).toEqual([
      ['t1', 'PS> '],
      ['t1', 'echo hi\r\n'],
      ['t1', 'hi\r\n']
    ])
    expect(registry.attach('nope')).toBeNull()
  })

  it('caps the tail at the last 256 KB of output', () => {
    expect(TAIL_LIMIT).toBe(256 * 1024)
    create({ id: 't1' })
    const chunk = 'a'.repeat(1000)
    for (let i = 0; i < 300; i++) last().emit(chunk)
    last().emit('END')
    const tail = registry.attach('t1')?.tail ?? ''
    expect(tail.length).toBe(256 * 1024)
    expect(tail.endsWith('aaaEND')).toBe(true)
  })

  it('writes input to the running pty', () => {
    create({ id: 't1' })
    registry.write('t1', 'ls\r')
    expect(last().written).toEqual(['ls\r'])
  })

  it('restarts with the same id, label, cwd, kind, env and command, and clears the tail', () => {
    create({ id: 't1', command: 'pnpm dev', env: { A: '1' }, label: 'dev server' })
    const first = last()
    first.emit('old output')
    first.exit(1)
    clock = 9000
    registry.restart('t1')
    const second = last()
    expect(second).not.toBe(first)
    expect(second.args).toEqual(first.args)
    expect(second.env.A).toBe('1')
    expect(registry.list()).toEqual([
      {
        id: 't1',
        workspaceId: 'ws1',
        cwd: 'C:\\repo',
        label: 'dev server',
        command: 'pnpm dev',
        kind: 'pwsh',
        env: { A: '1' },
        status: 'running',
        startedAt: 9000
      }
    ])
    expect(registry.attach('t1')?.tail).toBe('')
    second.emit('new')
    expect(registry.attach('t1')?.tail).toBe('new')
  })

  it('kills a still-running pty on restart and ignores its late exit', async () => {
    create({ id: 't1' })
    const first = last()
    registry.restart('t1')
    await settled()
    expect(first.killed).toBe(true)
    expect(treeKilled).toEqual([first.pid])
    first.exit(1)
    expect(registry.list()[0].status).toBe('running')
  })

  it('closes a terminal by killing its process tree and removing it', async () => {
    create({ id: 't1' })
    const p = last()
    await registry.close('t1')
    expect(p.killed).toBe(true)
    expect(treeKilled).toEqual([p.pid])
    expect(registry.list()).toEqual([])
    expect(changes.at(-1)).toEqual([])
    p.exit(1)
    expect(registry.list()).toEqual([])
  })

  it('renames a terminal', () => {
    create({ id: 't1' })
    registry.rename('t1', 'watcher')
    expect(registry.list()[0].label).toBe('watcher')
  })

  it('counts the running terminals', () => {
    create({ id: 't1' })
    create({ id: 't2' })
    const p2 = last()
    create({ id: 't3' })
    expect(registry.runningCount()).toBe(3)
    p2.exit(0)
    registry.close('t3')
    expect(registry.runningCount()).toBe(1)
  })

  it('keeps a failed start listed as exited, its error in the tail', () => {
    const failing = new TerminalRegistry(
      new PtyManager({
        spawn: () => {
          throw new Error('no conpty')
        },
        locate: (kind) => ({ command: kind, args: [] }),
        killTree: async () => undefined
      }),
      () => clock
    )
    const res = failing.create({ id: 't1', workspaceId: 'ws1', cwd: 'C:\\repo', kind: 'bash' })
    expect(res).toMatchObject({ ok: false, error: 'no conpty' })
    expect(failing.list()[0]).toMatchObject({ status: 'exited' })
    expect(failing.attach('t1')?.tail).toContain('no conpty')
  })

  it('closes every terminal on quit', async () => {
    create({ id: 't1' })
    create({ id: 't2' })
    await registry.closeAll()
    expect(spawned.every((p) => p.killed)).toBe(true)
    expect(registry.list()).toEqual([])
  })
})
