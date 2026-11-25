import { useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import type { BackgroundProcess, BackgroundProcessStatus } from '../../../shared/backgroundProcesses'
import type { LocalServer } from '../../../shared/localPorts'
import { useHostedChatOnScreen } from '../../hooks/useHostedChatOnScreen'
import { useTicking } from '../../hooks/useTicking'
import {
  useBackgroundProcessesStore,
  usePaneProcesses,
  useProcessOutputs,
  useProcessServers,
  useStopErrors,
  type ProcessOutput
} from '../../state/backgroundProcessesStore'
import { useToastStore } from '../../state/toastStore'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ListItem, ListRowLines, ListRowMeta } from '../ui/ListRow'
import { TerminalOutput } from '../ui/TerminalOutput'
import { DotMark, type TimelineDot } from '../ui/Timeline'
import { MessageColumn } from './MessageColumn'
import { duration } from './subagents'

const DOT: Record<BackgroundProcessStatus, Exclude<TimelineDot, 'none' | 'neutral'>> = { running: 'progress', finished: 'success', failed: 'error', stopped: 'error' }
const LABEL: Record<BackgroundProcessStatus, string> = { running: 'Running', finished: 'Finished', failed: 'Failed', stopped: 'Stopped' }
const REFRESH_MS = 1000
const NO_SERVERS: LocalServer[] = []

/** Refreshes running processes' output while the tab is on screen, and fetches an ended one's output once. */
function useOutputRefresh(paneId: string, processes: readonly BackgroundProcess[], outputs: Record<string, ProcessOutput>): void {
  const onScreen = useHostedChatOnScreen(paneId)
  const fetchOutput = useBackgroundProcessesStore((s) => s.fetchOutput)
  const running = processes
    .filter((p) => p.status === 'running')
    .map((p) => p.taskId)
    .join(' ')
  useEffect(() => {
    if (!onScreen || running === '') return
    const refresh = () => {
      for (const taskId of running.split(' ')) void fetchOutput(paneId, taskId)
    }
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(timer)
  }, [onScreen, running, paneId, fetchOutput])
  useEffect(() => {
    if (!onScreen) return
    for (const p of processes) if (p.status !== 'running' && !outputs[p.taskId]?.final) void fetchOutput(paneId, p.taskId)
  }, [onScreen, processes, outputs, paneId, fetchOutput])
}

async function openServer(url: string): Promise<void> {
  const error = await window.api.backgroundProcesses.openInBrowser(url)
  if (error) useToastStore.getState().show(`Could not open ${url}: ${error}`)
}

/** The Processes tab: a hosted session's background processes, running ones first. */
export function ProcessesPanel({ paneId }: { paneId: string }) {
  const processes = usePaneProcesses(paneId)
  const stopErrors = useStopErrors(paneId)
  const outputs = useProcessOutputs(paneId)
  const servers = useProcessServers(paneId)
  const stop = useBackgroundProcessesStore((s) => s.stop)
  const now = useTicking(processes.some((p) => p.status === 'running'))
  useOutputRefresh(paneId, processes, outputs)
  return (
    <div role="tabpanel" aria-label="Processes" className="absolute inset-0 overflow-y-auto py-2">
      {processes.length === 0 ? (
        <EmptyState>No background processes are running.</EmptyState>
      ) : (
        <MessageColumn>
          <ul aria-label="Background processes">
            {processes.map((p) => (
              <ProcessRow
                key={p.taskId}
                process={p}
                now={now}
                error={stopErrors[p.taskId]}
                output={outputs[p.taskId]?.tail}
                servers={servers[p.taskId] ?? NO_SERVERS}
                onStop={() => void stop(paneId, p.taskId)}
              />
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
  output: string | undefined
  servers: readonly LocalServer[]
  onStop: () => void
}

function ProcessRow({ process, now, error, output, servers, onStop }: RowProps) {
  const ran = (process.endedAt ?? now) - process.startedAt
  return (
    <ListItem tooltip={process.command} detail={output ? <TerminalOutput text={output} label={`Output of ${process.command}`} /> : undefined}>
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
      {servers.map((server) => (
        <Button key={server.port} variant="link" label={`Open ${server.url}`} tooltip={`Open ${server.url} in the browser`} onClick={() => void openServer(server.url)}>
          {server.url.replace(/^https?:\/\//, '')}
          <ExternalLink size={12} aria-hidden />
        </Button>
      ))}
      {process.status === 'running' && (
        <Button variant="danger" onClick={onStop}>
          Stop
        </Button>
      )}
    </ListItem>
  )
}
