import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, GitBranch, RefreshCw } from 'lucide-react'
import { getFileIcon } from './files/fileIcons'
import { basename } from './files/fileTreeUtil'
import { useProjectViewsStore } from '../state/projectViewsStore'
import type { GitFile, GitStatusResult } from '../../shared/types'

interface Props {
  cwd: string
  projectId: string
}

interface StagedRow {
  file: GitFile
  staged: boolean
  isUntracked: boolean
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  M: { label: 'M', color: 'text-amber-400' },
  A: { label: 'A', color: 'text-emerald-400' },
  D: { label: 'D', color: 'text-red-400' },
  R: { label: 'R', color: 'text-blue-400' },
  C: { label: 'C', color: 'text-blue-400' },
  U: { label: 'U', color: 'text-pink-400' },
  '?': { label: 'U', color: 'text-emerald-400' }
}

const DEFAULT_VISIBLE_PER_SECTION = 200

function categorize(file: GitFile): StagedRow[] {
  const rows: StagedRow[] = []
  if (file.staged === '?' && file.unstaged === '?') {
    rows.push({ file, staged: false, isUntracked: true })
    return rows
  }
  if (file.staged !== ' ' && file.staged !== '?') {
    rows.push({ file, staged: true, isUntracked: false })
  }
  if (file.unstaged !== ' ' && file.unstaged !== '?') {
    rows.push({ file, staged: false, isUntracked: false })
  }
  return rows
}

export function SourceControlPanel({ cwd, projectId }: Props) {
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const openDiff = useProjectViewsStore((s) => s.openDiff)

  const refresh = async () => {
    setLoading(true)
    try {
      const result = await window.api.git.status(cwd)
      setStatus(result)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd])

  const { staged, unstaged, untracked } = useMemo(() => {
    const s: StagedRow[] = []
    const u: StagedRow[] = []
    const t: StagedRow[] = []
    for (const f of status?.files ?? []) {
      for (const r of categorize(f)) {
        if (r.isUntracked) t.push(r)
        else if (r.staged) s.push(r)
        else u.push(r)
      }
    }
    return { staged: s, unstaged: u, untracked: t }
  }, [status])

  const filteredStaged = useFilter(staged, filter)
  const filteredUnstaged = useFilter(unstaged, filter)
  const filteredUntracked = useFilter(untracked, filter)

  const totalCount = staged.length + unstaged.length + untracked.length

  const handleClick = async (row: StagedRow) => {
    const kind = row.isUntracked ? 'untracked' : row.staged ? 'staged' : 'unstaged'
    const result = await window.api.git.diff(
      cwd,
      row.file.path,
      row.staged,
      row.isUntracked
    )
    const diffText =
      result.ok && typeof result.text === 'string' ? result.text : result.error ?? ''
    openDiff(projectId, { path: row.file.path, kind, diffText })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          source control
        </span>
        <button
          onClick={refresh}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title="refresh"
        >
          <RefreshCw size={12} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>
      <div className="shrink-0 border-b border-zinc-800 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
          <GitBranch size={12} strokeWidth={2} className="text-blue-400" />
          {status?.isRepo ? (
            <span className="font-medium">{status.branch || 'detached'}</span>
          ) : (
            <span className="italic text-zinc-500">not a git repo</span>
          )}
          {status?.isRepo && (
            <span className="ml-auto text-zinc-500">
              {totalCount} change{totalCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
      {status?.isRepo && totalCount > 0 && (
        <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter changes…"
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
          />
        </div>
      )}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-1">
        {!status && loading && (
          <div className="px-3 py-2 text-xs italic text-zinc-500">loading…</div>
        )}
        {status?.error && (
          <div className="m-2 rounded border border-red-900 bg-red-950/30 px-2 py-1 text-xs text-red-300">
            {status.error}
          </div>
        )}
        {status && !status.error && totalCount === 0 && (
          <div className="px-3 py-2 text-xs italic text-zinc-600">no changes</div>
        )}
        <Section title="staged" rows={filteredStaged} onClick={handleClick} />
        <Section title="changes" rows={filteredUnstaged} onClick={handleClick} />
        <Section title="untracked" rows={filteredUntracked} onClick={handleClick} />
      </div>
    </div>
  )
}

function useFilter(rows: StagedRow[], filter: string): StagedRow[] {
  return useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.file.path.toLowerCase().includes(q))
  }, [rows, filter])
}

interface SectionProps {
  title: string
  rows: StagedRow[]
  onClick: (row: StagedRow) => void
}

function Section({ title, rows, onClick }: SectionProps) {
  const [showAll, setShowAll] = useState(false)
  if (rows.length === 0) return null

  const truncated = !showAll && rows.length > DEFAULT_VISIBLE_PER_SECTION
  const visible = truncated ? rows.slice(0, DEFAULT_VISIBLE_PER_SECTION) : rows

  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        <span>
          {title} <span className="ml-1 text-zinc-600">{rows.length}</span>
        </span>
      </div>
      {visible.map((row) => {
        const name = basename(row.file.path)
        const { icon: Icon, color } = getFileIcon(name)
        const code = row.isUntracked
          ? '?'
          : row.staged
            ? row.file.staged
            : row.file.unstaged
        const status = STATUS_LABEL[code] ?? { label: code, color: 'text-zinc-400' }
        return (
          <button
            key={`${row.staged ? 's' : row.isUntracked ? 'u' : 'w'}:${row.file.path}`}
            onClick={() => onClick(row)}
            className="group flex w-full items-center gap-1.5 px-3 py-[3px] pr-2 text-left text-[12px] leading-tight text-zinc-300 transition-colors hover:bg-zinc-900"
            title={row.file.path}
          >
            <ChevronRight size={11} strokeWidth={2.25} className="shrink-0 text-zinc-600" />
            <Icon size={12} strokeWidth={1.75} className={`shrink-0 ${color}`} />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className={`shrink-0 font-mono text-[10px] ${status.color}`}>
              {status.label}
            </span>
          </button>
        )
      })}
      {truncated && (
        <button
          onClick={() => setShowAll(true)}
          className="flex w-full items-center justify-center gap-1 px-3 py-2 text-[11px] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
        >
          show all {rows.length}
          <span className="text-zinc-700">
            (+{rows.length - DEFAULT_VISIBLE_PER_SECTION} hidden)
          </span>
        </button>
      )}
    </div>
  )
}
