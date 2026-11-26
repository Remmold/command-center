import { spawn, type ChildProcess } from 'node:child_process'
import { killTree } from '../util/killTree'
import { portOpen } from '../util/portOpen'
import type { AppActionResult, AppStatus, ManagedApp } from '../../shared/types'

type OutputCallback = (id: string, data: string) => void
type ExitCallback = (id: string, exitCode: number | null) => void

class AppManager {
  // Tracks the launcher process per app. Note many launchers exit after spawning
  // detached windows — true "running" is decided by the app's ports, not this map.
  private procs = new Map<string, ChildProcess>()
  private busy = new Set<string>()
  private outputListeners: OutputCallback[] = []
  private exitListeners: ExitCallback[] = []

  private emit(id: string, data: string): void {
    for (const cb of this.outputListeners) cb(id, data)
  }

  async start(app: ManagedApp, update: boolean): Promise<AppActionResult> {
    if (this.busy.has(app.id)) return { ok: false, error: 'an action is already running' }
    this.busy.add(app.id)
    try {
      if (update && app.updateCommand) {
        this.emit(app.id, `\n[update] ${app.updateCommand}\n`)
        const ok = await this.runToEnd(app, [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          app.updateCommand
        ])
        if (!ok) {
          this.emit(app.id, '[update failed — not launching]\n')
          return { ok: false, error: 'update failed' }
        }
      }
      this.emit(app.id, `\n[start] ${app.command} ${app.args.join(' ')}\n`)
      const child = spawn(app.command, app.args, { cwd: app.cwd, windowsHide: true })
      this.procs.set(app.id, child)
      child.stdout?.on('data', (d) => this.emit(app.id, d.toString()))
      child.stderr?.on('data', (d) => this.emit(app.id, d.toString()))
      child.on('error', (e) => this.emit(app.id, `[error] ${e.message}\n`))
      child.on('exit', (code) => {
        this.procs.delete(app.id)
        for (const cb of this.exitListeners) cb(app.id, code)
      })
      return { ok: true }
    } finally {
      this.busy.delete(app.id)
    }
  }

  private runToEnd(app: ManagedApp, args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const c = spawn('powershell.exe', args, { cwd: app.cwd, windowsHide: true })
      c.stdout?.on('data', (d) => this.emit(app.id, d.toString()))
      c.stderr?.on('data', (d) => this.emit(app.id, d.toString()))
      c.on('exit', (code) => resolve(code === 0))
      c.on('error', (e) => {
        this.emit(app.id, `[error] ${e.message}\n`)
        resolve(false)
      })
    })
  }

  async stop(app: ManagedApp): Promise<AppActionResult> {
    let acted = false
    for (const port of app.ports) {
      await this.killPort(app.id, port)
      acted = true
    }
    const child = this.procs.get(app.id)
    if (child?.pid) {
      try {
        killTree(child.pid)
        acted = true
      } catch {
        /* already gone */
      }
      this.procs.delete(app.id)
    }
    return { ok: acted, error: acted ? undefined : 'nothing to stop' }
  }

  private killPort(id: string, port: number): Promise<void> {
    return new Promise((resolve) => {
      const c = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
            'Select-Object -ExpandProperty OwningProcess -Unique | ' +
            'ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }'
        ],
        { windowsHide: true }
      )
      c.on('exit', () => {
        this.emit(id, `[stop] freed port ${port}\n`)
        resolve()
      })
      c.on('error', () => resolve())
    })
  }

  async status(apps: ManagedApp[]): Promise<AppStatus[]> {
    return Promise.all(
      apps.map(async (a) => {
        const running = a.ports.length
          ? (await Promise.all(a.ports.map(portOpen))).some(Boolean)
          : Boolean(this.procs.get(a.id))
        return { id: a.id, running, busy: this.busy.has(a.id) }
      })
    )
  }

  onOutput(cb: OutputCallback): () => void {
    this.outputListeners.push(cb)
    return () => {
      this.outputListeners = this.outputListeners.filter((c) => c !== cb)
    }
  }

  onExit(cb: ExitCallback): () => void {
    this.exitListeners.push(cb)
    return () => {
      this.exitListeners = this.exitListeners.filter((c) => c !== cb)
    }
  }
}

export const appManager = new AppManager()
