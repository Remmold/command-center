import { useEffect, useMemo } from 'react'
import { FolderPlus, Trash2 } from 'lucide-react'
import type { Workspace } from '../../../shared/types'
import { groupByRepo, type RepoGroupView } from '../../../shared/repoGroups'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { useProfilesStore } from '../../state/profilesStore'
import { useRepoDisplayName } from '../../state/repoIdentitiesStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { ProfilePicker } from '../ProfilePicker'
import { RepoIcon } from '../RepoIcon'
import { RepoIdentityEditor } from '../RepoIdentityEditor'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { DrawerList } from '../ui/Drawer'
import { ListItem, ListRowText } from '../ui/ListRow'
import { Page, PageBody, PageGroup, PageHeader, PageNote } from '../ui/Page'

export function WorkspacesSettings() {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const load = useWorkspacesStore((s) => s.load)
  const add = useWorkspacesStore((s) => s.add)
  const openProject = useProjectViewsStore((s) => s.openProject)
  const loadProfiles = useProfilesStore((s) => s.load)
  const groups = useMemo(() => groupByRepo(workspaces), [workspaces])

  useEffect(() => {
    void load()
    void loadProfiles()
  }, [load, loadProfiles])

  const handleAdd = async (): Promise<void> => {
    const added = await add()
    if (added) openProject(added)
  }

  return (
    <Page label="Workspaces">
      <PageHeader
        title="Workspaces"
        description="Every workspace, grouped by repo, with the account profile its sessions use."
        actions={
          <Button onClick={() => void handleAdd()}>
            <FolderPlus size={12} />
            Add workspace
          </Button>
        }
      />
      <PageBody>
        {groups.length === 0 && <PageNote>No workspaces yet.</PageNote>}
        {groups.map((group) => (
          <RepoGroupBlock key={group.repoGroupKey} group={group} />
        ))}
      </PageBody>
    </Page>
  )
}

function RepoGroupBlock({ group }: { group: RepoGroupView }) {
  const title = useRepoDisplayName(group.repoGroupKey, group.repoName)
  return (
    <PageGroup
      title={title}
      icon={<RepoIcon repoGroupKey={group.repoGroupKey} repoName={group.repoName} size="sm" />}
      actions={<RepoIdentityEditor group={group} revealOnHover={false} />}
    >
      <DrawerList>
        {group.workspaces.map((w) => (
          <WorkspaceItem key={w.id} workspace={w} />
        ))}
      </DrawerList>
    </PageGroup>
  )
}

function WorkspaceItem({ workspace }: { workspace: Workspace }) {
  const remove = useWorkspacesStore((s) => s.remove)
  const closeProject = useProjectViewsStore((s) => s.closeProject)
  const handleRemove = (): void => {
    closeProject(workspace.id)
    void remove(workspace.id)
  }

  return (
    <ListItem tooltip={workspace.path}>
      {workspace.worktreeTag && <Badge>{workspace.worktreeTag}</Badge>}
      <ListRowText primary={workspace.name} secondary={workspace.path} />
      <ProfilePicker workspace={workspace} labelled />
      <Button variant="ghost" onClick={handleRemove} tooltip="Forget this workspace; its files stay on disk">
        <Trash2 size={12} />
        Remove
      </Button>
    </ListItem>
  )
}
