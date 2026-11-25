import type { BackgroundProcess, BackgroundProcessStatus } from '../../../shared/backgroundProcesses'
import { useTicking } from '../../hooks/useTicking'
import { useBackgroundProcessesStore, usePaneProcesses, useStopErrors } from '../../state/backgroundProcessesStore'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ListItem, ListRowLines, ListRowMeta } from '../ui/ListRow'
import { DotMark, type TimelineDot } from '../ui/Timeline'
import { MessageColumn } from './MessageColumn'
import { duration } from './subagents'

const DOT: Record<BackgroundProcessStatus, Exclude<TimelineDot, 'none' | 'neutral'>> = { running: 'progress', finished: 'success', failed: 'error', stopped: 'error' }
const LABEL: Record<BackgroundProcessStatus, string> = { running: 'Running', finished: 'Finished', failed: 'Failed', stopped: 'Stopped' }

/** The Processes tab: a hosted session's background processes, running ones first. */
export function ProcessesPanel({ paneId }: { paneId: string }) {
  const processes = usePaneProcesses(paneId)
  const stopErrors = useStopErrors(paneId)
  const stop = useBackgroundProcessesStore((s) => s.stop)
  const now = useTicking(processes.some((p) => p.status === 'running'))
  return (
    <div role="tabpanel" aria-label="Processes" className="absolute inset-0 overflow-y-auto py-2">
      {processes.length === 0 ? (
        <EmptyState>No background processes are running.</EmptyState>
      ) : (
        <MessageColumn>
          <ul aria-label="Background processes">
            {processes.map((p) => (
              <ProcessRow key={p.taskId} process={p} now={now} error={stopErrors[p.taskId]} onStop={() => void stop(paneId, p.taskId)} />
            ))}
          </ul>
        </MessageColumn>
      )}
    </div>
  )
}

interface RowProps {
  process: BackgroundProcess
  now: number
  error: string | undefined
  onStop: () => void
}

function ProcessRow({ process, now, error, onStop }: RowProps) {
  const ran = (process.endedAt ?? now) - process.startedAt
  return (
    <ListItem tooltip={process.command}>
      <DotMark dot={DOT[process.status]} />
      <ListRowLines
        primary={
          <>
            <span data-process-command="" className="min-w-0 flex-1 truncate font-mono">{process.command}</span>
            <ListRowMeta>
              <span data-process-status="">{LABEL[process.status]}</span> · {duration(ran)}
            </ListRowMeta>
          </>
        }
        secondary={error && <span role="alert" className="min-w-0 truncate text-error">{error}</span>}
      />
      {process.status === 'running' && (
        <Button variant="danger" onClick={onStop}>
          Stop
        </Button>
      )}
    </ListItem>
  )
}
