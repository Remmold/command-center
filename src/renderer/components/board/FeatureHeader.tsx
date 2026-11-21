import type { BoardFeature, FeatureState } from '../../../shared/types'
import { RepoIcon } from '../RepoIcon'
import { useRepoDisplayName } from '../../state/repoIdentitiesStore'
import { Badge } from '../ui/Badge'
import { HeaderRow } from '../ui/HeaderRow'
import { ProgressBar } from '../ui/ProgressBar'

const STATE_BADGE: Partial<Record<FeatureState, string>> = {
  'spec-only': 'spec only',
  empty: 'no tickets'
}

interface Props {
  repoGroupKey: string
  repoName: string
  feature: BoardFeature
}

export function FeatureHeader({ repoGroupKey, repoName, feature }: Props) {
  const badge = STATE_BADGE[feature.state]
  const { done, total, lastNote } = feature.progress
  const displayName = useRepoDisplayName(repoGroupKey, repoName)
  return (
    <HeaderRow
      icon={<RepoIcon repoGroupKey={repoGroupKey} repoName={repoName} size="sm" />}
      subtitle={displayName}
      title={feature.name}
      note={lastNote}
    >
      {badge && <Badge>{badge}</Badge>}
      {total > 0 && <ProgressBar value={done} max={total} label={`${feature.name}: ${done} of ${total} done`} />}
    </HeaderRow>
  )
}
