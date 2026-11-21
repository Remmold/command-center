import type { ProjectView } from '../state/projectViewsStore'

interface Props {
  view: ProjectView
}

export function GitPane({ view: _view }: Props) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex shrink-0 items-center justify-between border-b border-subtle px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          git
        </span>
      </header>
      <div className="flex flex-1 items-center justify-center text-xs text-faint">
        git diff coming in phase e
      </div>
    </section>
  )
}
