import { useState } from 'react'
import { OBSERVED_STATUS_LABEL } from '../../../shared/types'
import { STATUS_LABEL } from '../../../shared/needsYou'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import type { SessionGroupId, SessionRow } from '../../state/sessionList'
import { isOpen, openRow, useOpenTarget, useSessionGroups, useWorkSearchStore } from '../../state/workSessions'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { ListGroup } from '../ui/ListGroup'
import { ListRow, ListRowText } from '../ui/ListRow'
import { SearchField } from '../ui/SearchField'
import { EmptyHint } from '../ui/Section'
import { StatusDot } from '../ui/StatusDot'
import { TextField } from '../ui/TextField'

const GROUP_TITLE: Record<SessionGroupId, string> = {
  'needs-you': 'Needs you',
  running: 'Running',
  idle: 'Idle',
  'in-vscode': 'In VS Code'
}

export function SessionList() {
  const groups = useSessionGroups()
  const target = useOpenTarget()
  const search = useWorkSearchStore((s) => s.search)
  const setSearch = useWorkSearchStore((s) => s.setSearch)
  const [renaming, setRenaming] = useState<string | null>(null)

  return (
    <nav aria-label="Sessions" className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="shrink-0 p-2">
        <SearchField label="Search sessions" placeholder="Search title, repo or worktree" value={search} onChange={setSearch} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-2">
        {groups.length === 0 && <EmptyHint>{search.trim() ? 'No session matches.' : 'No sessions yet.'}</EmptyHint>}
        {groups.map((g) => (
          <ListGroup key={g.id} title={GROUP_TITLE[g.id]} count={g.rows.length}>
            {g.rows.map((row) =>
              row.key === renaming && row.kind === 'hosted' ? (
                <RenameRow key={row.key} paneId={row.paneId} title={row.title} onDone={() => setRenaming(null)} />
              ) : (
                <SessionListRow
                  key={row.key}
                  row={row}
                  active={isOpen(row, target)}
                  onRename={row.kind === 'hosted' ? () => setRenaming(row.key) : undefined}
                />
              )
            )}
          </ListGroup>
        ))}
      </div>
    </nav>
  )
}

function rowTooltip(row: SessionRow): string {
  const where = [row.repoName, row.workspace.worktreeTag].filter(Boolean).join(' · ')
  if (row.kind === 'observed') return `${row.title} · ${where} · ${OBSERVED_STATUS_LABEL[row.status]} in VS Code (read-only)`
  return `${row.title} · ${where} · ${STATUS_LABEL[row.status]} · double-click to rename`
}

function SessionListRow({ row, active, onRename }: { row: SessionRow; active: boolean; onRename?: () => void }) {
  const { workspace } = row
  return (
    <ListRow active={active} onClick={() => openRow(row, { focus: false })} onDoubleClick={onRename} tooltip={rowTooltip(row)}>
      <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />
      {workspace.worktreeTag && <Badge>{workspace.worktreeTag}</Badge>}
      <ListRowText primary={row.title} />
      <StatusDot status={row.status} />
    </ListRow>
  )
}

function RenameRow({ paneId, title, onDone }: { paneId: string; title: string; onDone: () => void }) {
  const renameSession = useProjectViewsStore((s) => s.renameSession)
  return (
    <li className="px-2 py-0.5">
      <TextField
        label="Session title"
        initialValue={title}
        autoFocus
        submitOnBlur
        onSubmit={(name) => {
          renameSession(paneId, name)
          onDone()
        }}
        onCancel={onDone}
      />
    </li>
  )
}
