import { useEffect, useState } from 'react'
import type { LocalSessionInfo } from '../../shared/types'

interface Props {
  cwd: string
  onClose: () => void
  onLoad: (info: LocalSessionInfo) => void
}

function formatAge(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

export function PastSessionsModal({ cwd, onClose, onLoad }: Props) {
  const [sessions, setSessions] = useState<LocalSessionInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    window.api.claude
      .listLocalSessions(cwd)
      .then((s) => {
        if (!cancelled) setSessions(s)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message ?? 'failed to list sessions')
      })
    return () => {
      cancelled = true
    }
  }, [cwd])

  const filtered = (sessions ?? []).filter(
    (s) =>
      s.sessionId.toLowerCase().includes(filter.toLowerCase()) ||
      s.preview.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-subtle bg-editor shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <div>
            <div className="text-sm font-medium text-fg">load past session</div>
            <div className="text-xs text-muted truncate">{cwd}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-list-hover hover:text-fg"
          >
            ✕
          </button>
        </header>
        <div className="border-b border-subtle px-4 py-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by preview or session id…"
            className="w-full rounded border border-strong bg-input px-3 py-1.5 text-xs text-fg placeholder:text-muted focus:border-focus focus:outline-none"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions === null && !error && (
            <div className="px-4 py-8 text-center text-sm text-muted">loading…</div>
          )}
          {error && (
            <div className="m-4 rounded-md border border-red-900 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {sessions !== null && filtered.length === 0 && !error && (
            <div className="px-4 py-8 text-center text-sm text-muted">
              {sessions.length === 0
                ? 'no past sessions found for this directory'
                : 'no sessions match filter'}
            </div>
          )}
          {filtered.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => {
                onLoad(s)
                onClose()
              }}
              className="flex w-full flex-col gap-1 border-b border-subtle px-4 py-3 text-left hover:bg-list-hover"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted">{s.sessionId.slice(0, 12)}…</span>
                <span className="text-faint">
                  {formatAge(s.modifiedAt)} · {s.messageCount} msg
                </span>
              </div>
              <div className="truncate text-sm text-fg">{s.preview}</div>
            </button>
          ))}
        </div>
        <footer className="border-t border-subtle px-4 py-2 text-[10px] text-faint">
          loading a session creates a new chat tab and resumes claude with --resume
        </footer>
      </div>
    </div>
  )
}
