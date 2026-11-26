import { useEffect, useMemo, useState } from 'react'
import { FolderPlus, ListPlus, Pencil, Plus } from 'lucide-react'
import type { LocalSessionInfo, SessionStatus, Workspace } from '../../../shared/types'
import { accountOf } from '../../state/accounts'
import { useLauncherStore } from '../../state/launcherStore'
import { useObservedStore } from '../../state/observedStore'
import { pastSessionDot, sessionAge, type PastSessionDotState } from '../../state/pastSessions'
import { usePastSessionsStore } from '../../state/pastSessionsStore'
import { enterAction, sessionRows, stepBack, type PickAction, type PickerRow, type PickerStep, type SessionListStep, type SessionWhereabouts } from '../../state/projectPicker'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { useRecentProjectsStore } from '../../state/recentProjectsStore'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { openObserved, openSession, resumeSession, startSession } from '../../state/sessionNavigation'
import { useSessionStatusStore } from '../../state/sessionStatusStore'
import { renameHostedSession } from '../../state/sessionTitleSync'
import { useToastStore } from '../../state/toastStore'
import { useTakeOverStore, type TakeOverTarget } from '../../state/takeOverStore'
import { useAccounts } from '../../state/useAccounts'
import { workspaceLabel, workspacePicks } from '../../state/workspacePicker'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { repoDisplayName } from '../../../shared/repoIdentity'
import { AccountTag } from '../AccountTag'
import { RepoIcon } from '../RepoIcon'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { IconButton } from '../ui/IconButton'
import { QuickPick, type QuickPickItem } from '../ui/QuickPick'
import { StatusDot } from '../ui/StatusDot'
import { TextField } from '../ui/TextField'

type FinalAction = Exclude<PickAction, { kind: 'show-all' }>

const workspaceById = (id: string): Workspace | undefined => useWorkspacesStore.getState().workspaces.find((w) => w.id === id)

const DOT_STATUS: Record<PastSessionDotState, SessionStatus> = { running: 'running', waiting: 'needs-approval', idle: 'idle' }

/** The one picker behind + New session, Ctrl+T, Past sessions… and Ctrl+L: a project, then its New chat and recent sessions. */
export function SessionLauncher() {
  const opened = useLauncherStore((s) => s.opened)
  const openCount = useLauncherStore((s) => s.openCount)
  return opened ? <ProjectPicker key={openCount} start={opened} /> : null
}

function ProjectPicker({ start }: { start: PickerStep }) {
  const [step, setStep] = useState<PickerStep>(start)
  const [takingOver, setTakingOver] = useState<TakeOverTarget | null>(null)
  const close = useLauncherStore((s) => s.close)
  const workspace = useWorkspacesStore((s) => (step.kind === 'sessions' ? s.workspaces.find((w) => w.id === step.workspaceId) : undefined))

  const run = (action: FinalAction) => {
    if (action.kind === 'open-project') {
      setStep({ kind: 'sessions', workspaceId: action.workspaceId })
      return
    }
    if (action.kind === 'take-over') {
      setTakingOver(action.target)
      return
    }
    close()
    const target = workspaceById(action.workspaceId)
    if (!target) return
    if (action.kind === 'new-chat') startSession(target)
    else if (action.kind === 'resume' || !openSession(action.paneId)) void resumeSession(target, action.session)
    else useRecentProjectsStore.getState().touch(target.id)
  }

  if (takingOver) {
    const takeOver = (now: boolean) => {
      openObserved(takingOver.workspaceId, takingOver.sessionId)
      useTakeOverStore.getState().request(takingOver, { now })
      useRecentProjectsStore.getState().touch(takingOver.workspaceId)
      close()
    }
    return (
      <ConfirmDialog
        title="Open in VS Code"
        message={`"${takingOver.title}" is open in VS Code. Opening it here as well would split it into two copies. Take it over instead?`}
        confirmLabel="Take over when done"
        onConfirm={() => takeOver(false)}
        alternative={{ label: 'Take over now', onClick: () => takeOver(true) }}
        onCancel={() => setTakingOver(null)}
      />
    )
  }
  if (step.kind === 'sessions' && workspace) {
    return <SessionsStep key={workspace.id} step={step} workspace={workspace} onBack={() => setStep(stepBack(step))} onRun={run} onClose={close} />
  }
  return <ProjectsStep onRun={run} onClose={close} />
}

interface StepProps {
  onRun: (action: FinalAction) => void
  onClose: () => void
}

function ProjectsStep({ onRun, onClose }: StepProps) {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const recent = useRecentProjectsStore((s) => s.recent)
  const accounts = useAccounts()
  const [query, setQuery] = useState('')
  const open = (workspaceId: string) => onRun({ kind: 'open-project', workspaceId })

  const items: QuickPickItem[] = workspacePicks({ workspaces, identities, query, recent }).map(({ workspace, repoName }) => ({
        key: workspace.id,
        leading: <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />,
        label: workspaceLabel(workspace, repoName),
        description: workspace.path,
        trailing: accounts.length > 1 ? <AccountTag label={accountOf(accounts, workspace.profileId).label} /> : undefined,
        keepOpen: true,
        onPick: () => open(workspace.id)
      }))

  const footer: QuickPickItem[] = [
    {
      key: 'add-workspace',
      icon: FolderPlus,
      label: 'Add workspace…',
      keepOpen: true,
      onPick: () => {
        void useWorkspacesStore
          .getState()
          .add()
          .then((added) => added && open(added.id))
      }
    }
  ]

  return (
    <QuickPick
      label="Open a workspace"
      placeholder="Type to find a workspace"
      query={query}
      onQueryChange={setQuery}
      items={items}
      footer={footer}
      empty={workspaces.length === 0 ? 'No workspaces yet.' : 'No workspace matches.'}
      onClose={onClose}
    />
  )
}

/** claude session id → the hosted tab showing it, in this workspace. */
function useOpenPanes(workspaceId: string): Map<string, string> {
  const view = useProjectViewsStore((s) => s.views[workspaceId])
  return useMemo(() => new Map((view?.claudeSessions ?? []).flatMap((c) => (c.claudeSessionId ? [[c.claudeSessionId, c.id] as const] : []))), [view])
}

interface SessionsStepProps extends StepProps {
  step: SessionListStep
  workspace: Workspace
  onBack: () => void
}

function SessionsStep({ step, workspace, onBack, onRun, onClose }: SessionsStepProps) {
  const cwd = workspace.path
  const sessions = usePastSessionsStore((s) => s.byCwd[cwd])
  const error = usePastSessionsStore((s) => s.errorByCwd[cwd])
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const openPanes = useOpenPanes(workspace.id)
  const statusByPane = useSessionStatusStore((s) => s.byPane)
  const observed = useObservedStore((s) => s.sessions)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  useEffect(() => {
    void usePastSessionsStore.getState().refresh(cwd)
  }, [cwd])

  const where: SessionWhereabouts = (sessionId) => ({
    paneId: openPanes.get(sessionId),
    vsCodeWorkspaceId: observed.find((o) => o.sessionId === sessionId)?.workspaceId
  })
  const enter = (row: PickerRow) => {
    const action = enterAction(step, row, where)
    if (action.kind === 'show-all') setShowAll(true)
    else onRun(action)
  }

  const rename = async (info: LocalSessionInfo, title: string) => {
    setRenaming(null)
    if (title === info.title) return
    const store = usePastSessionsStore.getState()
    store.retitle(cwd, info.sessionId, { title, titleSource: 'renamed' })
    const paneId = openPanes.get(info.sessionId)
    const result = paneId ? await renameHostedSession(paneId, title) : await window.api.claude.renameSession({ cwd, sessionId: info.sessionId, title })
    if (result.ok) store.retitle(cwd, info.sessionId, { title: result.title, titleSource: 'renamed' })
    else {
      store.retitle(cwd, info.sessionId, info)
      useToastStore.getState().show(`Rename failed: ${result.error}`)
    }
  }

  const now = Date.now()
  const { shown, hidden } = sessionRows({ sessions: sessions ?? [], query, showAll })
  const items: QuickPickItem[] = shown.map((s) => {
    const paneId = openPanes.get(s.sessionId)
    const dot = pastSessionDot({
      hosted: paneId ? (statusByPane[paneId]?.status ?? 'idle') : undefined,
      observed: observed.find((o) => o.sessionId === s.sessionId)?.status
    })
    return {
      key: s.sessionId,
      leading: dot ? <StatusDot status={DOT_STATUS[dot.state]} tooltip={dot.tooltip} /> : undefined,
      label: s.title,
      description: s.gitBranch,
      tooltip: s.title,
      trailing: sessionAge(s.modifiedAt, now),
      actions: (
        <IconButton label="Rename session" tooltip="Rename session (F2)" onClick={() => setRenaming(s.sessionId)}>
          <Pencil size={12} />
        </IconButton>
      ),
      editor:
        renaming === s.sessionId ? (
          <TextField label="Session title" initialValue={s.title} autoFocus submitOnBlur onSubmit={(title) => void rename(s, title)} onCancel={() => setRenaming(null)} />
        ) : undefined,
      keepOpen: true,
      onRename: () => setRenaming(s.sessionId),
      onPick: () => enter({ kind: 'session', session: s })
    }
  })
  const pinned: QuickPickItem[] = [{ key: 'new-chat', icon: Plus, label: 'New chat', keepOpen: true, onPick: () => enter({ kind: 'new-chat' }) }]
  const footer: QuickPickItem[] =
    hidden > 0 ? [{ key: 'show-all', icon: ListPlus, label: 'Show all', description: `${hidden} more`, keepOpen: true, onPick: () => enter({ kind: 'show-all' }) }] : []

  const repoName = repoDisplayName(workspace.repoName, identities[workspace.repoGroupKey])
  const empty = error ?? (sessions === undefined ? 'Loading…' : sessions.length === 0 ? 'No sessions yet' : 'No sessions found')

  return (
    <QuickPick
      label="Open a workspace"
      title={workspaceLabel(workspace, repoName)}
      onBack={onBack}
      placeholder="Search sessions…"
      query={query}
      onQueryChange={setQuery}
      pinned={pinned}
      items={items}
      footer={footer}
      highlight={query}
      empty={empty}
      onClose={onClose}
    />
  )
}
