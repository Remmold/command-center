import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { DiscoveredFolder, DiscoveredRepo } from '../../../shared/types'
import { notAddedRepos } from '../../state/boardLayout'
import { useBoardStore } from '../../state/boardStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { RepoIcon } from '../RepoIcon'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { DrawerList } from '../ui/Drawer'
import { ListItem, ListRowMeta, ListRowText } from '../ui/ListRow'
import { PageNote } from '../ui/Page'

function counts({ featureCount, openTicketCount }: Pick<DiscoveredFolder, 'featureCount' | 'openTicketCount'>): string {
  return `${featureCount} ${featureCount === 1 ? 'feature' : 'features'} · ${openTicketCount} open`
}

/** Repos with tickets under the scan roots that aren't workspaces yet, each with an Add button. */
export function NotAddedList() {
  const repos = useBoardStore((s) => s.discovery.repos)
  const addPath = useWorkspacesStore((s) => s.addPath)
  const [showWorktrees, setShowWorktrees] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listed = notAddedRepos(repos, showWorktrees)
  const add = (path: string): void => {
    setError(null)
    addPath(path)
      .then((result) => !result.ok && setError(result.error))
      .catch((err: unknown) => setError(String(err)))
  }

  return (
    <>
      <Checkbox checked={showWorktrees} onChange={setShowWorktrees}>
        show worktrees
      </Checkbox>
      {error && <PageNote>{error}</PageNote>}
      {listed.length === 0 && <PageNote>Nothing left to add.</PageNote>}
      <DrawerList>
        {listed.map((repo) => (
          <RepoRows key={repo.repoGroupKey} repo={repo} onAdd={add} />
        ))}
      </DrawerList>
    </>
  )
}

function repoNote(repo: DiscoveredRepo): string | undefined {
  if (repo.mainAdded) return 'main checkout added'
  if (!repo.main) return 'tickets only in worktrees'
  return undefined
}

function RepoRows({ repo, onAdd }: { repo: DiscoveredRepo; onAdd: (path: string) => void }) {
  return (
    <>
      <ListItem tooltip={repo.main?.path}>
        <RepoIcon repoGroupKey={repo.repoGroupKey} repoName={repo.repoName} size="sm" />
        <ListRowText primary={repo.repoName} secondary={repoNote(repo)} />
        <ListRowMeta>{counts(repo)}</ListRowMeta>
        {repo.main && <AddButton path={repo.main.path} onAdd={onAdd} />}
      </ListItem>
      {repo.worktrees.map((wt) => (
        <ListItem key={wt.path} tooltip={wt.path} nested>
          <ListRowText primary={wt.worktreeTag || wt.path} />
          <ListRowMeta>{counts(wt)}</ListRowMeta>
          <AddButton path={wt.path} onAdd={onAdd} />
        </ListItem>
      ))}
    </>
  )
}

function AddButton({ path, onAdd }: { path: string; onAdd: (path: string) => void }) {
  return (
    <Button variant="ghost" onClick={() => onAdd(path)} tooltip={`Add ${path} as a workspace`}>
      <Plus size={12} />
      Add workspace
    </Button>
  )
}
