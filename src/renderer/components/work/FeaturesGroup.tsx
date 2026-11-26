import { useMemo } from 'react'
import { accountNote, featureRows, type FeatureRow } from '../../state/featureRows'
import { useFeaturesStore } from '../../state/featuresStore'
import { useProfilesStore } from '../../state/profilesStore'
import { openSession } from '../../state/sessionNavigation'
import { useSessionStatusStore } from '../../state/sessionStatusStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { RepoIcon } from '../RepoIcon'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { ListRow, ListRowLabel, ListRowText } from '../ui/ListRow'
import { StatusDot } from '../ui/StatusDot'
import { useState } from 'react'

/** The features in progress, above the ordinary sessions; nothing shows without one. */
export function FeaturesGroup() {
  const features = useFeaturesStore((s) => s.features)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const profiles = useProfilesStore((s) => s.profiles)
  const byPane = useSessionStatusStore((s) => s.byPane)
  const [open, setOpen] = useState(true)
  const rows = useMemo(() => featureRows(features, workspaces, profiles, byPane), [features, workspaces, profiles, byPane])
  if (rows.length === 0) return null
  return (
    <CollapsibleSection title="Features" open={open} onToggle={() => setOpen(!open)}>
      <ul>
        {rows.map((row) => (
          <FeatureListRow key={row.name} row={row} />
        ))}
      </ul>
    </CollapsibleSection>
  )
}

function FeatureListRow({ row }: { row: FeatureRow }) {
  const { workspace } = row
  return (
    <ListRow rowKey={`feature:${row.name}`} size="roomy" onClick={() => openSession(row.sessionId, { focus: false })} tooltip={`${row.name} · ${accountNote(row)}`}>
      {workspace && <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} />}
      <ListRowText primary={row.name} />
      <ListRowLabel tone="secondary" hideWhenNarrow>
        {accountNote(row)}
      </ListRowLabel>
      <StatusDot status={row.status} look="soft" />
    </ListRow>
  )
}
