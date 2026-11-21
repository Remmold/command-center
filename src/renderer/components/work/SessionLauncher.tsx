import { useMemo, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import type { Workspace } from '../../../shared/types'
import { useLauncherStore, type PickPurpose } from '../../state/launcherStore'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { resumeSession, startSession } from '../../state/sessionNavigation'
import { workspacePicks } from '../../state/workspacePicker'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { PastSessionsModal } from '../PastSessionsModal'
import { RepoIcon } from '../RepoIcon'
import { QuickPick, type QuickPickItem } from '../ui/QuickPick'

const PLACEHOLDER: Record<PickPurpose, string> = {
  'new-session': 'Start a new session in which workspace?',
  'past-sessions': 'Show past sessions of which workspace?'
}

/** The workspace picker behind + New session and Past sessions…, and the past-sessions list it leads to. */
export function SessionLauncher() {
  const picking = useLauncherStore((s) => s.picking)
  const pastFor = useLauncherStore((s) => s.pastFor)
  const closePastSessions = useLauncherStore((s) => s.closePastSessions)
  return (
    <>
      {picking && <WorkspacePicker purpose={picking} />}
      {pastFor && (
        <PastSessionsModal cwd={pastFor.path} onClose={closePastSessions} onLoad={(info) => resumeSession(pastFor, info)} />
      )}
    </>
  )
}

function choose(purpose: PickPurpose, workspace: Workspace): void {
  if (purpose === 'new-session') startSession(workspace)
  else useLauncherStore.getState().showPastSessions(workspace)
}

function WorkspacePicker({ purpose }: { purpose: PickPurpose }) {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const closePicker = useLauncherStore((s) => s.closePicker)
  const [query, setQuery] = useState('')

  const items = useMemo<QuickPickItem[]>(
    () =>
      workspacePicks({ workspaces, identities, query }).map(({ workspace, repoName }) => ({
        key: workspace.id,
        leading: <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />,
        label: workspace.worktreeTag ? `${repoName} · ${workspace.worktreeTag}` : repoName,
        description: workspace.path,
        onPick: () => choose(purpose, workspace)
      })),
    [workspaces, identities, query, purpose]
  )

  const footer: QuickPickItem[] = [
    {
      key: 'add-workspace',
      icon: FolderPlus,
      label: 'Add workspace…',
      onPick: () => {
        void useWorkspacesStore
          .getState()
          .add()
          .then((added) => added && choose(purpose, added))
      }
    }
  ]

  return (
    <QuickPick
      label="Pick a workspace"
      placeholder={PLACEHOLDER[purpose]}
      query={query}
      onQueryChange={setQuery}
      items={items}
      footer={footer}
      empty={workspaces.length === 0 ? 'No workspaces yet.' : 'No workspace matches.'}
      onClose={closePicker}
    />
  )
}
