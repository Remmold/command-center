import { useEffect, useState } from 'react'
import { fileBaseName } from '../../../shared/fileLinks'
import type { TestFlowPick, TestFlowView } from '../../../shared/testFlow'
import { MessageColumn } from '../chat/MessageColumn'
import { EmptyState } from '../ui/EmptyState'
import { HeaderRow } from '../ui/HeaderRow'
import { Markdown } from '../ui/Markdown'
import { SandboxedPage } from '../ui/SandboxedPage'
import { Toolbar } from '../ui/Toolbar'

type Shown = { path: string; view: TestFlowView } | null

function useTestFlowView(path: string | null): TestFlowView | null {
  const [shown, setShown] = useState<Shown>(null)
  useEffect(() => {
    if (!path) return
    let active = true
    window.api.testFlow
      .read(path)
      .then((view) => active && setShown({ path, view }))
      .catch((err) => {
        console.error('could not read the test flow', err)
        if (active) setShown({ path, view: { found: false } })
      })
    return () => {
      active = false
    }
  }, [path])
  return path && shown?.path === path ? shown.view : null
}

interface Props {
  pick: TestFlowPick | null
  folder: string
  repoName: string
}

/** A session's test flow: its HTML twin in a sandboxed frame, else its markdown, else why there is none. */
export function TestFlowPanel({ pick, folder, repoName }: Props) {
  const view = useTestFlowView(pick?.path ?? null)
  const missing = !pick || (view !== null && !view.kind)
  return (
    <div role="tabpanel" aria-label="Test" className="absolute inset-0 flex flex-col bg-editor">
      <Toolbar>
        <HeaderRow title={view?.kind ? view.name : pick ? fileBaseName(pick.path) : 'Test flow'} />
      </Toolbar>
      {missing ? (
        <EmptyState>
          No test flow found: looked in {folder} for {pick ? fileBaseName(pick.path) : 'a file'} (repo {repoName || 'unknown'}).
        </EmptyState>
      ) : view?.kind === 'html' ? (
        <SandboxedPage url={view.url} title={view.name} />
      ) : view?.kind === 'md' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <MessageColumn>
            <Markdown text={view.text} />
          </MessageColumn>
        </div>
      ) : null}
    </div>
  )
}
