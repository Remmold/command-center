import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Square,
  Terminal,
  Trash2
} from 'lucide-react'
import { useAppsStore } from '../state/appsStore'
import type { ManagedApp, ManagedAppInput } from '../../shared/types'

function StatusDot({ running, busy }: { running: boolean; busy: boolean }): JSX.Element {
  const color = busy ? 'bg-amber-400' : running ? 'bg-emerald-400' : 'bg-zinc-600'
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
}

function AppCard({ app }: { app: ManagedApp }): JSX.Element {
  const status = useAppsStore((s) => s.status[app.id])
  const output = useAppsStore((s) => s.output[app.id] ?? '')
  const start = useAppsStore((s) => s.start)
  const stop = useAppsStore((s) => s.stop)
  const restart = useAppsStore((s) => s.restart)
  const remove = useAppsStore((s) => s.remove)
  const [update, setUpdate] = useState(false)
  const [showLog, setShowLog] = useState(false)

  const running = status?.running ?? false
  const busy = status?.busy ?? false

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center gap-3 px-4 py-3">
        <StatusDot running={running} busy={busy} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{app.name}</span>
            {app.ports.map((p) => (
              <span
                key={p}
                className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
              >
                :{p}
              </span>
            ))}
          </div>
          <div className="truncate text-[11px] text-zinc-500" title={app.cwd}>
            {app.cwd}
          </div>
        </div>

        {app.updateCommand && (
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-400" title={app.updateCommand}>
            <input
              type="checkbox"
              checked={update}
              onChange={(e) => setUpdate(e.target.checked)}
              className="accent-blue-500"
            />
            update
          </label>
        )}

        {busy ? (
          <Loader2 size={16} className="animate-spin text-amber-400" />
        ) : running ? (
          <>
            <IconButton title="Restart" onClick={() => void restart(app.id, update)}>
              <RotateCw size={15} strokeWidth={1.9} />
            </IconButton>
            <IconButton title="Stop" onClick={() => void stop(app.id)} danger>
              <Square size={15} strokeWidth={1.9} />
            </IconButton>
          </>
        ) : (
          <IconButton title="Start" onClick={() => void start(app.id, update)} accent>
            <Play size={15} strokeWidth={1.9} />
          </IconButton>
        )}

        <IconButton title="Output" onClick={() => setShowLog((v) => !v)} active={showLog}>
          <Terminal size={15} strokeWidth={1.9} />
        </IconButton>
        <IconButton title="Remove from list" onClick={() => void remove(app.id)}>
          <Trash2 size={15} strokeWidth={1.9} />
        </IconButton>
      </div>

      {showLog && (
        <pre className="max-h-56 overflow-auto border-t border-zinc-800 bg-zinc-950 px-4 py-2 text-[11px] leading-relaxed text-zinc-400">
          {output || '(no output yet)'}
        </pre>
      )}
    </div>
  )
}

function IconButton({
  children,
  onClick,
  title,
  accent,
  danger,
  active
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  accent?: boolean
  danger?: boolean
  active?: boolean
}): JSX.Element {
  const tone = accent
    ? 'text-emerald-400 hover:bg-emerald-400/10'
    : danger
      ? 'text-zinc-300 hover:bg-red-500/10 hover:text-red-400'
      : active
        ? 'bg-zinc-800 text-zinc-100'
        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
  return (
    <button onClick={onClick} title={title} className={`rounded-md p-1.5 ${tone}`}>
      {children}
    </button>
  )
}

function AddAppForm({ onDone }: { onDone: () => void }): JSX.Element {
  const add = useAppsStore((s) => s.add)
  const [name, setName] = useState('')
  const [cwd, setCwd] = useState('')
  const [command, setCommand] = useState('powershell.exe')
  const [argsText, setArgsText] = useState('-NoProfile -ExecutionPolicy Bypass -File start.ps1')
  const [portsText, setPortsText] = useState('')
  const [updateCommand, setUpdateCommand] = useState('git pull')

  const valid = name.trim() && cwd.trim() && command.trim()

  const submit = async (): Promise<void> => {
    const app: ManagedAppInput = {
      name: name.trim(),
      cwd: cwd.trim(),
      command: command.trim(),
      args: argsText.trim() ? argsText.trim().split(/\s+/) : [],
      ports: portsText
        .split(',')
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => Number.isFinite(n)),
      updateCommand: updateCommand.trim() || undefined
    }
    await add(app)
    onDone()
  }

  const field = 'w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-blue-500'

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <input className={field} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={field} placeholder="Working dir (c:\projects\...)" value={cwd} onChange={(e) => setCwd(e.target.value)} />
      <div className="flex gap-2">
        <input className={field} placeholder="Command" value={command} onChange={(e) => setCommand(e.target.value)} />
        <input className={field} placeholder="Ports (comma-separated)" value={portsText} onChange={(e) => setPortsText(e.target.value)} />
      </div>
      <input className={field} placeholder="Args" value={argsText} onChange={(e) => setArgsText(e.target.value)} />
      <input className={field} placeholder="Update command (optional)" value={updateCommand} onChange={(e) => setUpdateCommand(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="rounded px-3 py-1 text-xs text-zinc-400 hover:text-zinc-100">
          cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={!valid}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-40"
        >
          add app
        </button>
      </div>
    </div>
  )
}

export function AppsDashboard(): JSX.Element {
  const apps = useAppsStore((s) => s.apps)
  const refresh = useAppsStore((s) => s.refresh)
  const load = useAppsStore((s) => s.load)
  const setShowApps = useAppsStore((s) => s.setShowApps)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void refresh(), 3000)
    return () => window.clearInterval(t)
  }, [load, refresh])

  const sorted = useMemo(() => [...apps].sort((a, b) => a.name.localeCompare(b.name)), [apps])

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <div>
          <h1 className="text-sm font-semibold text-zinc-100">Apps</h1>
          <p className="text-[11px] text-zinc-500">Launch and monitor your projects. Status is by listening port.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 hover:bg-zinc-700"
          >
            <Plus size={14} /> Add app
          </button>
          <button
            onClick={() => setShowApps(false)}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            title="back to projects"
          >
            <ChevronDown size={14} /> Close
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-auto p-5">
        {adding && <AddAppForm onDone={() => setAdding(false)} />}
        {sorted.length === 0 && !adding && (
          <div className="py-16 text-center text-sm text-zinc-500">
            No apps yet — click “Add app”.
          </div>
        )}
        {sorted.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </div>
    </div>
  )
}
