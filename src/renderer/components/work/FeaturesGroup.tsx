import { useMemo, useState } from 'react'
import { accountNote, completedFeatureRows, featureRows, stageNote, type FeatureRow } from '../../state/featureRows'
import { useFeaturesStore } from '../../state/featuresStore'
import { useProfilesStore } from '../../state/profilesStore'
import { openSession } from '../../state/sessionNavigation'
import { useSessionStatusStore } from '../../state/sessionStatusStore'
import { useToastStore } from '../../state/toastStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { RepoIcon } from '../RepoIcon'
import { CollapsibleSection } from '../ui/CollapsibleSection'
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
  if (!openSession(row.sessionId, { focus: false })) {
    useToastStore.getState().show(`The session of ${row.name} was not found: it was closed, or its chat is gone.`)
  }
}

function FeatureListRow({ row }: { row: FeatureRow }) {
  const { workspace } = row
  const stage = stageNote(row)
  return (
    <ListRow rowKey={`feature:${row.name}`} size="roomy" onClick={() => openFeature(row)} tooltip={`${row.name}${stage ? ` · ${stage}` : ''} · ${accountNote(row)}`}>
      {workspace && <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} />}
      <ListRowText primary={row.name} />
      {stage && <ListRowLabel tooltip={stage}>{stage}</ListRowLabel>}
      <ListRowLabel tone="secondary" hideWhenNarrow>
        {accountNote(row)}
      </ListRowLabel>
      <StatusDot status={row.status} look="soft" />
    </ListRow>
  )
}
