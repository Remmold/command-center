import { ExternalLink } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef } from 'react'
import { fileBaseName } from '../../../shared/fileLinks'
import type { TestFlowPick, TestFlowView } from '../../../shared/testFlow'
import type { Mark, StepsView } from '../../../shared/testSteps'
import { MessageColumn } from '../chat/MessageColumn'
import { EmptyState } from '../ui/EmptyState'
import { HeaderRow } from '../ui/HeaderRow'
import { IconButton } from '../ui/IconButton'
import { Markdown } from '../ui/Markdown'
import { SandboxedPage } from '../ui/SandboxedPage'
import { Toolbar } from '../ui/Toolbar'
import { keepScrollPlace, scrollPlace } from './scrollPlaces'
import { TestStepsList } from './TestStepsList'

function MarkdownFlow({ folder, name, text }: { folder: string; name: string; text: string }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollPlace(folder, name)
  }, [folder, name])
  return (
    <div
      ref={scrollRef}
      onScroll={(e) => keepScrollPlace(folder, name, e.currentTarget.scrollTop)}
      className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
    >
      <MessageColumn>
        <Markdown text={text} />
      </MessageColumn>
    </div>
  )
}

function PageFlow({ folder, name, url }: { folder: string; name: string; url: string }) {
  const keep = useCallback((y: number) => keepScrollPlace(folder, name, y), [folder, name])
  return <SandboxedPage url={url} title={name} scrollY={scrollPlace(folder, name)} onScroll={keep} />
}

interface Props {
  picks: readonly TestFlowPick[]
  /** What the picks show; null while it is read. */
  view: TestFlowView | null
  folder: string
  repoName: string
  /** The session's title, shown before the file name where the session is not on screen beside it. */
  session?: string
  /** A feature's checklist with its marks; shown instead of the picks while it is found. */
  steps?: { view: StepsView | null; onMark: (hash: string, mark: Mark | null, note?: string) => void }
  onPopOut?: () => void
}

/** A session's test flow: its HTML twin in a sandboxed frame, else its markdown, else why there is none. Each file keeps its scroll place. */
export function TestFlowPanel({ picks, view, folder, repoName, session, steps, onPopOut }: Props) {
  const checklist = steps?.view?.found ? steps.view : null
  const missing = picks.length === 0 || (view !== null && !view.kind)
  const looked = picks.length > 0 ? picks.map((p) => fileBaseName(p.path)).join(', ') : 'a file'
  return (
    <div role="tabpanel" aria-label="Test" className="absolute inset-0 flex flex-col bg-editor">
      <Toolbar
        actions={
          onPopOut && (
            <IconButton onClick={onPopOut} label="Pop out" tooltip="Open the test flow in its own window, following the focused session">
              <ExternalLink size={14} />
            </IconButton>
          )
        }
      >
        <HeaderRow subtitle={session} title={checklist ? `${checklist.name}.md` : view?.kind ? view.name : picks.length > 0 ? fileBaseName(picks[0].path) : 'Test flow'} />
      </Toolbar>
      {checklist && steps ? (
        <TestStepsList view={checklist} onMark={steps.onMark} />
      ) : missing ? (
        <EmptyState>
          No test flow found: looked in {folder} for {looked} (repo {repoName || 'unknown'}).
        </EmptyState>
      ) : view?.kind === 'html' ? (
        <PageFlow folder={folder} name={view.name} url={view.url} />
      ) : view?.kind === 'md' ? (
        <MarkdownFlow folder={folder} name={view.name} text={view.text} />
      ) : null}
    </div>
  )
}
