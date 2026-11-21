import type { ProjectView } from '../state/projectViewsStore'

interface Props {
  view: ProjectView
}

export function GitPane({ view: _view }: Props) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-zinc-950">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          git
        </span>
      </header>
      <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
        git diff coming in phase e
      </div>
    </section>
  )
}
