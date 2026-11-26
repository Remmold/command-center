import { useMemo, useState } from 'react'
import { accountNote, completedFeatureRows, featureRows, stageNote, type FeatureRow } from '../../state/featureRows'
import { completeFeature, removeFeatureWorktree, reopenFeature, retryFeatureServer, openFeatureSession, startFeatureServers, stopFeatureServers, testFeature, useFeaturesStore } from '../../state/featuresStore'
import { serversNote, serversRunning, type FeatureServerView } from '../../../shared/featureServers'
import { Button } from '../ui/Button'
import { useProfilesStore } from '../../state/profilesStore'
import { useSessionStatusStore } from '../../state/sessionStatusStore'
import { useToastStore } from '../../state/toastStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { RepoIcon } from '../RepoIcon'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ListRow, ListRowLabel, ListRowText } from '../ui/ListRow'
import { StatusDot } from '../ui/StatusDot'

/** The features in progress, above the ordinary sessions, with the completed ones folded below; nothing shows without one. */
export function FeaturesGroup() {
  const features = useFeaturesStore((s) => s.features)
  const stages = useFeaturesStore((s) => s.stages)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const profiles = useProfilesStore((s) => s.profiles)
  const byPane = useSessionStatusStore((s) => s.byPane)
  const [open, setOpen] = useState(true)
  const [completedOpen, setCompletedOpen] = useState(false)
  const rows = useMemo(() => featureRows(features, workspaces, profiles, byPane, stages), [features, workspaces, profiles, byPane, stages])
  const completed = useMemo(() => completedFeatureRows(features, workspaces, profiles, byPane, stages), [features, workspaces, profiles, byPane, stages])
  if (rows.length === 0 && completed.length === 0) return null
  return (
    <CollapsibleSection title="Features" open={open} onToggle={() => setOpen(!open)}>
      <ul>
        {rows.map((row) => (
          <FeatureListRow key={row.name} row={row} />
        ))}
      </ul>
      {completed.length > 0 && (
        <CollapsibleSection title="Completed" level="group" open={completedOpen} onToggle={() => setCompletedOpen(!completedOpen)} badge={<span className="text-xs text-muted">{completed.length}</span>}>
          <ul>
            {completed.map((row) => (
              <FeatureListRow key={row.name} row={row} />
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </CollapsibleSection>
  )
}

function openFeature(row: FeatureRow): void {
  const feature = useFeaturesStore.getState().features.find((f) => f.name === row.name)
  if (!feature) return
  void openFeatureSession(feature).then((why) => {
    if (why) useToastStore.getState().show(why)
  })
}

function FeatureListRow({ row }: { row: FeatureRow }) {
  const { workspace } = row
  const stage = stageNote(row)
  const servers = useFeaturesStore((s) => s.servers[row.name])?.servers ?? []
  const serverNote = serversNote(servers)
  const completed = useFeaturesStore((s) => s.features.find((f) => f.name === row.name)?.completedAt ?? null) !== null
  const failed = servers.filter((s) => s.status === 'failed')
  const hasTestSteps = row.stage !== undefined && !row.stage.missing && row.stage.stage === 'Testing'
  const [asking, setAsking] = useState<'complete' | 'remove' | null>(null)
  const tests = row.stage && !row.stage.missing ? row.stage.tests : undefined
  const allPass = tests !== undefined && tests.pass > 0 && tests.fail === 0 && tests.waiting === 0
  const actions = completed ? (
    <>
      <Button variant="secondary" onClick={() => void reopenFeature(row.name)} tooltip="Bring this feature back to its stage, with fresh ports, so it can be tested again">
        Re-open
      </Button>
      <Button variant="ghost" onClick={() => setAsking('remove')} tooltip="Delete the worktree folder; the branch stays">
        Remove worktree
      </Button>
    </>
  ) : (
    <>
      {hasTestSteps && (
        <Button variant="secondary" onClick={() => testFeature(row.name)} tooltip="Boot the servers, then open the test steps and the preview browser side by side">
          Test
        </Button>
      )}
      {serversRunning(servers) ? (
        <Button variant="ghost" onClick={() => stopFeatureServers(row.name)} tooltip="Stop this feature's servers; it keeps its ports">
          Stop servers
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => startFeatureServers(row.name)} tooltip="Boot this feature's servers from its workspace's preview config">
          Start servers
        </Button>
      )}
      <Button variant="secondary" onClick={() => (allPass ? void completeFeature(row.name) : setAsking('complete'))} tooltip="Stop the servers, close the test windows and move this feature under Completed; the worktree and branch stay">
        Complete
      </Button>
    </>
  )
  return (
    <>
      <ListRow
        rowKey={`feature:${row.name}`}
        size="roomy"
        onClick={() => openFeature(row)}
        actions={actions}
        tooltip={`${row.name}${stage ? ` · ${stage}` : ''} · ${accountNote(row)}${serverNote ? ` · servers ${serverNote.toLowerCase()}` : ''}`}
      >
        {workspace && <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} />}
        <ListRowText primary={row.name} />
        {stage && <ListRowLabel tooltip={stage}>{stage}</ListRowLabel>}
        {serverNote && (
          <ListRowLabel tone={failed.length > 0 ? 'primary' : 'secondary'} tooltip={`Servers: ${serverNote}`}>
            {`Servers ${serverNote}`}
          </ListRowLabel>
        )}
        <ListRowLabel tone="secondary" hideWhenNarrow>
          {accountNote(row)}
        </ListRowLabel>
        <StatusDot status={row.status} look="soft" />
      </ListRow>
      {asking === 'complete' && (
        <ConfirmDialog
          title={`Complete ${row.name}?`}
          message="Some test steps are still open: not every step is marked Pass. Complete this feature anyway?"
          confirmLabel="Complete anyway"
          onConfirm={() => {
            setAsking(null)
            void completeFeature(row.name)
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking === 'remove' && (
        <ConfirmDialog
          title={`Remove the worktree of ${row.name}?`}
          message="The worktree folder is deleted. The branch stays. It is refused while the branch has commits the main branch does not."
          confirmLabel="Remove worktree"
          onConfirm={() => {
            setAsking(null)
            void removeFeatureWorktree(row.name)
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {failed.map((server) => (
        <FailedServer key={server.name} feature={row.name} server={server} />
      ))}
    </>
  )
}

function FailedServer({ feature, server }: { feature: string; server: FeatureServerView }) {
  return (
    <li className="flex flex-col gap-1 pb-2 pl-8 pr-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-error">
          {server.name} (port {server.port}) failed: {server.reason}
        </span>
        <Button variant="secondary" onClick={() => retryFeatureServer(feature, server.name)}>
          Retry
        </Button>
      </div>
      {server.output && <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-input p-1.5 text-[11px] text-muted">{server.output}</pre>}
    </li>
  )
}
