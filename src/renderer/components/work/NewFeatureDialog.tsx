import { useMemo, useState } from 'react'
import { nameProblem, proposeSlug } from '../../../shared/featureName'
import { workspaceOptions } from '../../../shared/workspaceLabel'
import { useFeaturesStore, startFeature } from '../../state/featuresStore'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { focusedTarget } from '../../state/sessionNavigation'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { Select } from '../ui/Select'

export function NewFeatureDialogHost() {
  const open = useFeaturesStore((s) => s.dialogOpen)
  return open ? <NewFeatureDialog /> : null
}

const FIELD = 'w-full rounded border border-strong bg-input px-1.5 py-1 text-xs text-fg focus:border-focus focus:outline-none'

function NewFeatureDialog() {
  const close = useFeaturesStore((s) => s.closeDialog)
  const features = useFeaturesStore((s) => s.features)
  const installing = useFeaturesStore((s) => s.installing)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const options = useMemo(() => workspaceOptions(workspaces, identities).map(({ id, label }) => ({ value: id, label })), [workspaces, identities])
  const [workspaceId, setWorkspaceId] = useState(() => {
    const focused = focusedTarget()?.workspaceId
    return workspaces.find((w) => w.id === focused)?.id ?? workspaces[0]?.id ?? ''
  })
  const [description, setDescription] = useState('')
  const [name, setName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shownName = nameEdited ? name : proposeSlug(description)
  const problem = shownName === '' ? null : nameProblem(shownName, features.map((f) => f.name))
  const ready = !busy && workspaceId !== '' && description.trim() !== '' && shownName !== '' && problem === null

  const start = async () => {
    setBusy(true)
    setError(null)
    const failed = await startFeature({ workspaceId, name: shownName, description })
    if (failed === null) close()
    else {
      setError(failed)
      setBusy(false)
    }
  }

  return (
    <Dialog title="New feature" onClose={close}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) void start()
        }}
      >
        <label className="flex flex-col gap-1">
          Workspace
          <Select label="Workspace" options={options} value={workspaceId} onChange={setWorkspaceId} disabled={busy} />
        </label>
        <label className="flex flex-col gap-1">
          Description
          <textarea aria-label="Feature description" rows={4} className={FIELD} value={description} disabled={busy} autoFocus onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Name (folder and branch)
          <input
            aria-label="Feature name"
            className={FIELD}
            value={shownName}
            disabled={busy}
            onChange={(e) => {
              setNameEdited(true)
              setName(e.target.value)
            }}
          />
        </label>
        {busy && installing[shownName] && (
          <p role="status" className="text-muted">
            Installing the workspace's dependencies in the new worktree…
          </p>
        )}
        {(problem ?? error) && (
          <p role="alert" className="text-error">
            {problem ?? error}
          </p>
        )}
        <DialogActions>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => void start()} disabled={!ready}>
            {busy ? 'Starting…' : 'Start feature'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
