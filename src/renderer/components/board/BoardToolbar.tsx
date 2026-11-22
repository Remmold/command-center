import { useMemo } from 'react'
import { repoDisplayName } from '../../../shared/repoIdentity'
import type { BoardModel } from '../../../shared/types'
import { featureOptions, type GroupBy } from '../../state/boardLayout'
import { useBoardStore } from '../../state/boardStore'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { RepoIcon } from '../RepoIcon'
import { Button } from '../ui/Button'
import { MultiSelect, type MultiSelectOption } from '../ui/MultiSelect'
import { SearchField } from '../ui/SearchField'
import { SegmentedControl } from '../ui/SegmentedControl'
import { ScanRootsButton } from './ScanRootsButton'

const GROUP_BY: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'feature', label: 'By feature' },
  { value: 'repo', label: 'By repo' },
  { value: 'account', label: 'By account' }
]

export function BoardToolbar({ model }: { model: BoardModel }) {
  const filter = useBoardStore((s) => s.filter)
  const groupBy = useBoardStore((s) => s.groupBy)
  const showFinished = useBoardStore((s) => s.showFinished)
  const setFilter = useBoardStore((s) => s.setFilter)
  const setGroupBy = useBoardStore((s) => s.setGroupBy)
  const toggleShowFinished = useBoardStore((s) => s.toggleShowFinished)
  const identities = useRepoIdentitiesStore((s) => s.identities)

  const repoOptions = useMemo<MultiSelectOption[]>(
    () =>
      model.repoGroups.map((g) => ({
        value: g.repoGroupKey,
        label: repoDisplayName(g.repoName, identities[g.repoGroupKey]),
        icon: <RepoIcon repoGroupKey={g.repoGroupKey} repoName={g.repoName} size="sm" />
      })),
    [model, identities]
  )
  const features = useMemo<MultiSelectOption[]>(() => {
    const options = featureOptions(model, filter.repoGroupKeys)
    const manyRepos = new Set(options.map((o) => o.repoGroupKey)).size > 1
    return options.map((o) => ({ value: o.key, label: o.featureName, hint: manyRepos ? o.repoName : undefined }))
  }, [model, filter.repoGroupKeys])

  return (
    <div role="toolbar" aria-label="Board filters" className="flex shrink-0 flex-wrap items-center gap-2 px-3">
      <MultiSelect label="Repo" options={repoOptions} selected={filter.repoGroupKeys} onChange={(repoGroupKeys) => setFilter({ repoGroupKeys })} />
      <MultiSelect label="Feature" options={features} selected={filter.featureKeys} onChange={(featureKeys) => setFilter({ featureKeys })} />
      <div className="w-56 min-w-0">
        <SearchField
          label="Search tickets"
          placeholder="Search number, title, note"
          value={filter.search}
          onChange={(search) => setFilter({ search })}
        />
      </div>
      <SegmentedControl label="Group by" options={GROUP_BY} value={groupBy} onChange={setGroupBy} />
      <Button variant="ghost" pressed={showFinished} onClick={toggleShowFinished} tooltip="Show the Done cards of features whose tickets are all done">
        Finished features
      </Button>
      <span className="flex-1" />
      <ScanRootsButton />
    </div>
  )
}
