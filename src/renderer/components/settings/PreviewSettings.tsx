import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { readPreviewConfig, type PreviewConfig } from '../../../shared/previewConfig'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { Button } from '../ui/Button'
import { FormRow } from '../ui/FormRow'
import { IconButton } from '../ui/IconButton'
import { NoticeLine } from '../ui/NoticeLine'
import { Page, PageBody, PageGroup, PageHeader, PageNote } from '../ui/Page'
import { SaveBar } from '../ui/SaveBar'
import { Select } from '../ui/Select'

interface ServerDraft {
  name: string
  command: string
  cwd: string
}
interface Draft {
  install: string
  servers: ServerDraft[]
  startPage: string
}

const EMPTY: Draft = { install: '', servers: [], startPage: '/' }

function toDraft(config: PreviewConfig | null): Draft {
  if (!config) return EMPTY
  return { install: config.install, servers: config.servers.map(({ name, command, cwd }) => ({ name, command, cwd })), startPage: config.startPage }
}

const INPUT = 'min-w-0 rounded border border-strong bg-input px-1.5 py-1 text-xs text-fg focus:border-focus focus:outline-none'

function Field({ label, value, placeholder, onChange, wide }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void; wide?: boolean }) {
  return <input aria-label={label} className={`${INPUT} ${wide ? 'w-full' : 'w-40'}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

/** Settings → Preview: each workspace's install command, servers and start page. A workspace with none has no browser. */
export function PreviewSettings() {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const load = useWorkspacesStore((s) => s.load)
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [saved, setSaved] = useState<Draft>(EMPTY)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  const current = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0]
  const currentId = current?.id

  useEffect(() => {
    if (!currentId) return
    let live = true
    setLoaded(false)
    window.api.previewConfig
      .get(currentId)
      .then((config) => {
        if (!live) return
        setSaved(toDraft(config))
        setDraft(toDraft(config))
        setError(null)
        setLoaded(true)
      })
      .catch((err) => {
        if (live) setError(`Could not read this workspace's preview config: ${err instanceof Error ? err.message : String(err)}`)
      })
    return () => {
      live = false
    }
  }, [currentId])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const hasBrowser = saved.servers.length > 0
  const set = (patch: Partial<Draft>): void => setDraft((d) => ({ ...d, ...patch }))
  const setServer = (i: number, patch: Partial<ServerDraft>): void => set({ servers: draft.servers.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const save = async (): Promise<void> => {
    if (!currentId) return
    const checked = readPreviewConfig(draft)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setSaving(true)
    const result = await window.api.previewConfig.save(currentId, draft)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const next = toDraft(result.config)
    setSaved(next)
    setDraft(next)
    setError(null)
  }

  return (
    <Page label="Preview">
      <PageHeader title="Preview" description="What New feature installs, and which servers and page the preview browser opens, per workspace." />
      <PageBody>
        {!current ? (
          <PageNote>Add a workspace first.</PageNote>
        ) : !loaded ? (
          <PageNote>{error ?? 'Loading…'}</PageNote>
        ) : (
          <>
            <PageGroup title="Workspace">
              <Select label="preview workspace" value={current.id} disabled={dirty} onChange={setWorkspaceId} options={workspaces.map((w) => ({ value: w.id, label: w.name }))} />
              {dirty && <PageNote>Save or discard your changes before picking another workspace.</PageNote>}
              {!hasBrowser && !dirty && <NoticeLine>No browser, only the test flow: this workspace has no preview servers.</NoticeLine>}
            </PageGroup>
            <PageGroup title="Install">
              <FormRow
                label="Install command"
                description="Runs in each new feature worktree before the feature session starts. A failure undoes the new feature and shows why."
                control={<Field label="install command" wide value={draft.install} placeholder="pnpm install" onChange={(install) => set({ install })} />}
              />
            </PageGroup>
            <PageGroup
              title="Servers"
              actions={
                <Button variant="secondary" onClick={() => set({ servers: [...draft.servers, { name: '', command: '', cwd: '.' }] })}>
                  <Plus size={12} />
                  Add server
                </Button>
              }
            >
              {draft.servers.length === 0 && <PageNote>No servers. Add a front end and an API if the project has both.</PageNote>}
              {draft.servers.map((s, i) => (
                <FormRow
                  key={i}
                  label={`Server ${i + 1}`}
                  description="Ready when its port accepts a connection. {port} in the command becomes the reserved port; the server also gets PORT."
                  control={
                    <IconButton label={`Remove server ${i + 1}`} tooltip="Remove this server" onClick={() => set({ servers: draft.servers.filter((_, j) => j !== i) })}>
                      <Trash2 size={13} />
                    </IconButton>
                  }
                >
                  <div className="flex flex-wrap gap-1.5">
                    <Field label={`server ${i + 1} name`} value={s.name} placeholder="name" onChange={(name) => setServer(i, { name })} />
                    <Field label={`server ${i + 1} command`} value={s.command} placeholder="pnpm dev --port {port}" onChange={(command) => setServer(i, { command })} />
                    <Field label={`server ${i + 1} folder`} value={s.cwd} placeholder="folder in the worktree" onChange={(cwd) => setServer(i, { cwd })} />
                  </div>
                </FormRow>
              ))}
            </PageGroup>
            <PageGroup title="Start page">
              <FormRow
                label="Start page"
                description="The path the preview browser opens on the first server."
                control={<Field label="start page" value={draft.startPage} placeholder="/" onChange={(startPage) => set({ startPage })} />}
              />
            </PageGroup>
          </>
        )}
      </PageBody>
      {loaded && (dirty || error) && (
        <SaveBar
          label="Unsaved preview changes"
          summary={dirty ? 'Unsaved preview changes' : 'Preview config'}
          error={error}
          actions={
            <>
              <Button disabled={!dirty || saving} onClick={() => void save()}>
                Save
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(saved)
                  setError(null)
                }}
              >
                Discard
              </Button>
            </>
          }
        />
      )}
    </Page>
  )
}
