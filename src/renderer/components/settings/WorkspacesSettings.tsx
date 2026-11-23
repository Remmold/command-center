import { useEffect, useMemo } from 'react'
import { FolderPlus, Trash2, UserRound } from 'lucide-react'
import type { Workspace } from '../../../shared/types'
import { groupByRepo, type RepoGroupView } from '../../../shared/repoGroups'
import { workspacesByAccount, type AccountWorkspaces } from '../../state/accounts'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { useProfilesStore } from '../../state/profilesStore'
import { useRepoDisplayName } from '../../state/repoIdentitiesStore'
import { useAccounts } from '../../state/useAccounts'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { ProfilePicker } from '../ProfilePicker'
import { RepoIcon } from '../RepoIcon'
import { RepoIdentityEditor } from '../RepoIdentityEditor'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { DrawerList } from '../ui/Drawer'
import { ListRowLabel, ListRowText } from '../ui/ListRow'
import { Page, PageBody, PageGroup, PageHeader, PageNote } from '../ui/Page'
import { SortableItem } from '../ui/SortableItem'
import { VsCodeAccountsBanner } from '../VsCodeAccountsBanner'

export function WorkspacesSettings() {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const load = useWorkspacesStore((s) => s.load)
  const add = useWorkspacesStore((s) => s.add)
  const openProject = useProjectViewsStore((s) => s.openProject)
  const loadProfiles = useProfilesStore((s) => s.load)
  const accounts = useAccounts()
  const byAccount = useMemo(() => workspacesByAccount(workspaces, accounts), [workspaces, accounts])
  const repoGroups = useMemo(() => new Map(groupByRepo(workspaces).map((g) => [g.repoGroupKey, g])), [workspaces])

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
        description="Every workspace under the account its sessions use. Drag a workspace to change its place; every list follows this order."
        actions={
          <Button onClick={() => void handleAdd()}>
            <FolderPlus size={12} />
            Add workspace
          </Button>
        }
      />
      <PageBody>
        <VsCodeAccountsBanner />
        {byAccount.length === 0 && <PageNote>No workspaces yet.</PageNote>}
        {byAccount.map((group) => (
          <AccountBlock key={group.account.profileId} group={group} repoGroups={repoGroups} />
        ))}
      </PageBody>
    </Page>
  )
}

function AccountBlock({ group, repoGroups }: { group: AccountWorkspaces; repoGroups: Map<string, RepoGroupView> }) {
  const move = useWorkspacesStore((s) => s.move)
  return (
    <PageGroup title={group.account.label} icon={<UserRound size={12} className="text-muted" />}>
      <DrawerList>
        {group.workspaces.map((w) => (
          <SortableItem
            key={w.id}
            id={w.id}
            group={group.account.profileId}
            onMove={(moved, target) => void move(moved, target)}
            label={w.name}
            tooltip={w.path}
          >
            <WorkspaceItem workspace={w} repoGroup={repoGroups.get(w.repoGroupKey)} />
          </SortableItem>
        ))}
      </DrawerList>
    </PageGroup>
  )
}

function WorkspaceItem({ workspace, repoGroup }: { workspace: Workspace; repoGroup: RepoGroupView | undefined }) {
  const remove = useWorkspacesStore((s) => s.remove)
  const closeProject = useProjectViewsStore((s) => s.closeProject)
  const repoName = useRepoDisplayName(workspace.repoGroupKey, workspace.repoName)
  const handleRemove = (): void => {
    closeProject(workspace.id)
    void remove(workspace.id)
  }

  return (
    <>
      <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />
      <ListRowLabel>{repoName}</ListRowLabel>
      {repoGroup && <RepoIdentityEditor group={repoGroup} />}
      {workspace.worktreeTag && <Badge>{workspace.worktreeTag}</Badge>}
      <ListRowText primary={workspace.name} secondary={workspace.path} />
      <ProfilePicker workspace={workspace} labelled />
      <Button variant="ghost" onClick={handleRemove} tooltip="Forget this workspace; its files stay on disk">
        <Trash2 size={12} />
        Remove
      </Button>
    </>
  )
}
