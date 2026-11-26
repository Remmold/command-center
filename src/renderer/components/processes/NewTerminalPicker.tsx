import { useState } from 'react'
import { SquareTerminal } from 'lucide-react'
import { DEFAULT_SHELL_KIND, type Workspace } from '../../../shared/types'
import { useRecentProjectsStore } from '../../state/recentProjectsStore'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { useTerminalsStore } from '../../state/terminalsStore'
import { workspaceLabel, workspacePicks } from '../../state/workspacePicker'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { RepoIcon } from '../RepoIcon'
import { QuickPick, type QuickPickItem } from '../ui/QuickPick'

const LABEL = 'New terminal'

interface Props {
  onClose: () => void
  /** The new terminal's id, once main was asked to start it. */
  onStarted: (terminalId: string) => void
}

/** Picks a workspace, then an optional command; the terminal runs in the workspace's folder in the default shell. */
export function NewTerminalPicker({ onClose, onStarted }: Props) {
  const [picked, setPicked] = useState<{ workspace: Workspace; label: string } | null>(null)
  return picked ? (
    <CommandStep workspace={picked.workspace} title={picked.label} onBack={() => setPicked(null)} onClose={onClose} onStarted={onStarted} />
  ) : (
    <WorkspaceStep onPick={(workspace, label) => setPicked({ workspace, label })} onClose={onClose} />
  )
}

function WorkspaceStep({ onPick, onClose }: { onPick: (workspace: Workspace, label: string) => void; onClose: () => void }) {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const recent = useRecentProjectsStore((s) => s.recent)
  const [query, setQuery] = useState('')
  const items: QuickPickItem[] = workspacePicks({ workspaces, identities, query, recent }).map(({ workspace, repoName }) => {
    const label = workspaceLabel(workspace, repoName)
    return {
      key: workspace.id,
      leading: <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />,
      label,
      description: workspace.path,
      keepOpen: true,
      onPick: () => onPick(workspace, label)
    }
  })
  return (
    <QuickPick
      label={LABEL}
      title="New terminal: pick a workspace"
      placeholder="Type to find a workspace"
      query={query}
      onQueryChange={setQuery}
      items={items}
      highlight={query}
      empty={workspaces.length === 0 ? 'No workspaces yet.' : 'No workspace matches.'}
      onClose={onClose}
    />
  )
}

interface CommandStepProps {
  workspace: Workspace
  title: string
  onBack: () => void
  onClose: () => void
  onStarted: (terminalId: string) => void
}

function CommandStep({ workspace, title, onBack, onClose, onStarted }: CommandStepProps) {
  const [command, setCommand] = useState('')
  const trimmed = command.trim()
  const start = (): void => {
    const id = crypto.randomUUID()
    void useTerminalsStore.getState().create({ id, workspaceId: workspace.id, cwd: workspace.path, kind: DEFAULT_SHELL_KIND, ...(trimmed ? { command: trimmed } : {}) })
    onStarted(id)
  }
  const pinned: QuickPickItem[] = [
    { key: 'start', icon: SquareTerminal, label: trimmed ? `Run ${trimmed}` : 'Open a plain shell', description: workspace.path, onPick: start }
  ]
  return (
    <QuickPick
      label={LABEL}
      title={title}
      onBack={onBack}
      placeholder="Command to run, e.g. pnpm dev (leave empty for a plain shell)"
      query={command}
      onQueryChange={setCommand}
      pinned={pinned}
      items={[]}
      empty="Enter starts it in the workspace's folder."
      onClose={onClose}
    />
  )
}
