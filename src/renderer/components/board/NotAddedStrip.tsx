import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { DiscoveredFolder, DiscoveredRepo } from '../../../shared/types'
import { useBoardStore } from '../../state/boardStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { RepoIcon } from '../RepoIcon'
import { Button } from '../ui/Button'
import { Collapsible } from '../ui/Collapsible'
import { DrawerList } from '../ui/Drawer'
import { ListItem, ListRowMeta, ListRowText } from '../ui/ListRow'
import { EmptyHint } from '../ui/Section'

function counts(folder: DiscoveredFolder): string {
  const features = `${folder.featureCount} ${folder.featureCount === 1 ? 'feature' : 'features'}`
  return `${features} · ${folder.openTicketCount} open`
}

export function NotAddedStrip() {
  const repos = useBoardStore((s) => s.discovery.repos)
  const open = useBoardStore((s) => s.notAddedOpen)
  const toggle = useBoardStore((s) => s.toggleNotAdded)
  const addPath = useWorkspacesStore((s) => s.addPath)
  const [error, setError] = useState<string | null>(null)

  if (repos.length === 0) return null
  const add = (path: string): void => {
    setError(null)
    addPath(path)
      .then((result) => !result.ok && setError(result.error))
      .catch((err: unknown) => setError(String(err)))
  }
  const total = repos.reduce((n, r) => n + (r.main ? 1 : 0) + r.worktrees.length, 0)

  return (
    <Collapsible title="Not added" count={total} open={open} onToggle={toggle}>
      {error && <EmptyHint>{error}</EmptyHint>}
      <DrawerList>
        {repos.map((repo) => (
          <RepoRows key={repo.repoGroupKey} repo={repo} onAdd={add} />
        ))}
      </DrawerList>
    </Collapsible>
  )
}

function RepoRows({ repo, onAdd }: { repo: DiscoveredRepo; onAdd: (path: string) => void }) {
  return (
    <>
      <ListItem tooltip={repo.main?.path}>
        <RepoIcon repoGroupKey={repo.repoGroupKey} repoName={repo.repoName} size="sm" />
        <ListRowText primary={repo.repoName} secondary={repo.mainAdded ? 'main checkout added' : undefined} />
        {repo.main && <ListRowMeta>{counts(repo.main)}</ListRowMeta>}
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
