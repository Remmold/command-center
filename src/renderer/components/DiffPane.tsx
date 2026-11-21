import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { UnifiedDiffView } from './chat/UnifiedDiffView'
import { useProjectViewsStore } from '../state/projectViewsStore'
import type { OpenDiff, ProjectView } from '../state/projectViewsStore'
import { basename } from './files/fileTreeUtil'

interface Props {
  view: ProjectView
}

const KIND_LABEL: Record<OpenDiff['kind'], string> = {
  staged: 'staged',
  unstaged: 'working',
  untracked: 'untracked'
}

const KIND_COLOR: Record<OpenDiff['kind'], string> = {
  staged: 'text-blue-300',
  unstaged: 'text-amber-300',
  untracked: 'text-emerald-300'
}

export function DiffPane({ view }: Props) {
  const updateDiffText = useProjectViewsStore((s) => s.updateDiffText)
  const [refreshing, setRefreshing] = useState(false)
  const active = (view.openDiffs ?? []).find((d) => d.id === view.activeDiffId) ?? null

  const handleRefresh = async () => {
    if (!active) return
    setRefreshing(true)
    try {
      const result = await window.api.git.diff(
        view.projectPath,
        active.path,
        active.kind === 'staged',
        active.kind === 'untracked'
      )
      if (result.ok && typeof result.text === 'string') {
        updateDiffText(view.projectId, active.id, result.text)
      }
    } finally {
      setRefreshing(false)
    }
  }

  if (!active) {
    return (
      <section className="flex h-full items-center justify-center text-sm text-zinc-600">
        no diff open
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-zinc-950">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="truncate font-medium text-zinc-100">{basename(active.path)}</span>
          <span className={`shrink-0 ${KIND_COLOR[active.kind]} text-[10px] uppercase tracking-wide`}>
            {KIND_LABEL[active.kind]}
          </span>
          <span className="truncate text-[10px] text-zinc-500">{active.path}</span>
        </div>
        <button
          onClick={handleRefresh}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title="refresh diff"
        >
          <RefreshCw size={12} strokeWidth={2.5} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-black/40 px-3 py-2">
        {active.diffText.trim() === '' ? (
          <div className="text-xs italic text-zinc-500">no changes</div>
        ) : (
          <UnifiedDiffView text={active.diffText} />
        )}
      </div>
    </section>
  )
}
