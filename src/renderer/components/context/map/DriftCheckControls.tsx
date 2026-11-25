import { useEffect, useMemo, useState } from 'react'
import type { ContextReport } from '../../../../shared/context'
import type { DriftCheckKind, DriftCheckProject } from '../../../../shared/driftCheck'
import type { Workspace } from '../../../../shared/types'
import { startDriftCheck } from '../../../state/driftCheckStart'
import type { Picked } from '../../../state/lastPick'
import { currentChoice, type ModelChoice } from '../../../state/modelPicker'
import { defaultsOf, startingChoiceOn, useModelStore } from '../../../state/modelStore'
import { useAccounts } from '../../../state/useAccounts'
import { EffortPicker } from '../../chat/EffortPicker'
import { ModelPicker } from '../../chat/ModelPicker'
import { Button } from '../../ui/Button'
import { ListRow, ListRowText } from '../../ui/ListRow'
import { NoticeLine } from '../../ui/NoticeLine'
import { SectionLabel } from '../../ui/SectionLabel'
import { CrossProjectDriftCheckDialog } from '../CrossProjectDriftCheckDialog'

const KINDS: { kind: DriftCheckKind; label: string; description: string }[] = [
  { kind: 'project', label: 'This project', description: 'memory, CLAUDE.md files, repo skills, agents and commands' },
  { kind: 'account', label: 'Account', description: "the account's CLAUDE.md, skills, agents, commands and settings" },
  { kind: 'cross-project', label: 'Across projects…', description: "pick the account's workspaces; the account files come along" }
]

/** The model and effort a new chat on the profile would start with, until picked here. */
function useStartingChoice(profileId: string): [ModelChoice, Picked, (next: Picked) => void] {
  const [picked, setPicked] = useState<Picked>(() => startingChoiceOn(profileId))
  const own = useModelStore((s) => s.modelsByProfile[profileId])
  const cachedModels = useModelStore((s) => s.cachedModels)
  const knownDefault = useModelStore((s) => s.defaultByProfile[profileId])
  const defaults = useModelStore((s) => defaultsOf(s.settingsByProfile, profileId))
  const loaded = useModelStore((s) => profileId in s.settingsByProfile)
  useEffect(() => {
    if (!loaded) void useModelStore.getState().loadDefaults(profileId)
  }, [loaded, profileId])
  const choice = useMemo(() => currentChoice({ own, cachedModels, knownDefault, defaults, session: picked }), [own, cachedModels, knownDefault, defaults, picked])
  return [choice, picked, setPicked]
}

interface Props {
  workspace: Workspace
  report: ContextReport
}

/** Tour step 6: which files a drift check covers, on which model, and Start. */
export function DriftCheckControls({ workspace, report }: Props) {
  const accountName = useAccounts().find((a) => a.profileId === workspace.profileId)?.name ?? workspace.profileId
  const [kind, setKind] = useState<DriftCheckKind>('project')
  const [choice, picked, setPicked] = useStartingChoice(workspace.profileId)
  const [picking, setPicking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async (projects: DriftCheckProject[], as: DriftCheckKind): Promise<void> => {
    setStarting(true)
    setError(null)
    try {
      setError(await startDriftCheck({ workspace, report, accountName, kind: as, projects, choice: picked }))
    } catch (err) {
      console.error('[context] could not start a drift check', err)
      setError('Could not start the drift check.')
    } finally {
      setStarting(false)
    }
  }

  const onStart = (): void => {
    if (kind === 'cross-project') setPicking(true)
    else void start(kind === 'project' ? [{ name: workspace.name, report }] : [], kind)
  }

  return (
    <section aria-label="Start a drift check" className="flex flex-col gap-1.5">
      <SectionLabel as="h3">Start a drift check</SectionLabel>
      <ul aria-label="What to check" className="-mx-2 flex flex-col">
        {KINDS.map((k) => (
          <ListRow key={k.kind} active={k.kind === kind} tooltip={k.description} onClick={() => setKind(k.kind)}>
            <ListRowText primary={k.label} secondary={k.description} />
          </ListRow>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Costs tokens: a session on the {accountName} account sends subagents through every file. You stay here while it runs; the chat waits in Work.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <ModelPicker models={choice.models} current={choice.selection} pill={choice.pill} onSelectModel={(model) => setPicked({ model })} />
        <EffortPicker level={choice.effort} levels={choice.levels} onSelect={(effort) => setPicked({ ...picked, effort })} />
        <span className="ml-auto">
          <Button onClick={onStart} disabled={starting}>
            {starting ? 'Starting…' : 'Start'}
          </Button>
        </span>
      </div>
      {error && <NoticeLine tone="warning">{error}</NoticeLine>}
      {picking && (
        <CrossProjectDriftCheckDialog
          workspace={workspace}
          accountName={accountName}
          onStart={(projects) => {
            setPicking(false)
            void start(projects, 'cross-project')
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  )
}
