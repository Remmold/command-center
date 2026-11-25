import { useMemo, useState } from 'react'
import type { DriftCheckProject } from '../../../shared/driftCheck'
import type { ContextReport } from '../../../shared/context'
import type { Workspace } from '../../../shared/types'
import { accountOf, workspacesByAccount } from '../../state/accounts'
import { useAccounts } from '../../state/useAccounts'
import { useContextStore } from '../../state/contextStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Dialog, DialogActions } from '../ui/Dialog'
import { NoticeLine } from '../ui/NoticeLine'

interface Props {
  workspace: Workspace
  accountName: string
  onStart: (projects: DriftCheckProject[]) => void
  onClose: () => void
}

/** Picks which of the workspace's account's workspaces a cross-project drift check covers; the account files are always in. */
export function CrossProjectDriftCheckDialog({ workspace, accountName, onStart, onClose }: Props) {
  const all = useWorkspacesStore((s) => s.workspaces)
  const accounts = useAccounts()
  const totals = useContextStore((s) => s.totals)
  const siblings = useMemo(() => {
    const profileId = accountOf(accounts, workspace.profileId).profileId
    return workspacesByAccount(all, accounts).find((g) => g.account.profileId === profileId)?.workspaces ?? [workspace]
  }, [all, accounts, workspace])
  const gone = (w: Workspace): boolean => totals[w.id] === null
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(siblings.filter((w) => !gone(w)).map((w) => w.id)))
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = siblings.filter((w) => ticked.has(w.id) && !gone(w))

  const toggle = (id: string, on: boolean): void => {
    const next = new Set(ticked)
    if (on) next.add(id)
    else next.delete(id)
    setTicked(next)
  }

  const start = async (): Promise<void> => {
    setReading(true)
    setError(null)
    try {
      const reports: (ContextReport | null)[] = await Promise.all(chosen.map((w) => window.api.context.report(w.id)))
      const projects = chosen.flatMap((w, i) => {
        const report = reports[i]
        return report?.folderExists ? [{ name: w.name, report }] : []
      })
      if (projects.length === 0) throw new Error('every ticked folder is gone')
      onStart(projects)
    } catch (err) {
      console.error('[context] could not read the reports for a drift check', err)
      setError('Could not read the context of the ticked workspaces.')
      setReading(false)
    }
  }

  return (
    <Dialog title="Drift check across projects" onClose={onClose}>
      <p className="text-muted">One session in {workspace.name} checks the ticked workspaces and the {accountName} account files.</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {siblings.map((w) => (
          <li key={w.id}>
            <Checkbox checked={ticked.has(w.id) && !gone(w)} disabled={gone(w)} onChange={(on) => toggle(w.id, on)}>
              {gone(w) ? `${w.name} (folder gone)` : w.name}
            </Checkbox>
          </li>
        ))}
        <li>
          <Checkbox checked disabled onChange={() => undefined}>
            {accountName} account files (always included)
          </Checkbox>
        </li>
      </ul>
      {error && <NoticeLine tone="warning">{error}</NoticeLine>}
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void start()} disabled={chosen.length === 0 || reading}>
          {reading ? 'Reading…' : 'Start'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
