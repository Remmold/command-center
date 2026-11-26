import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { readPreviewConfig, type PreviewConfig } from '../../../shared/previewConfig'
import { endPreviewSetup, startPreviewSetup, usePreviewSetupStore } from '../../state/previewSetup'
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
  const [setupNote, setSetupNote] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

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
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const waitingOn = usePreviewSetupStore((s) => (currentId ? s.pending[currentId] : undefined))

  useEffect(() => {
    setSetupNote(null)
  }, [currentId])

  // Claude writes the proposal into the named file; the draft lands here unsaved, so Save stays the user's act.
  useEffect(() => {
    if (!currentId || !loaded || !waitingOn) return
    let live = true
    const poll = async (): Promise<void> => {
      const read = await window.api.previewConfig.draftRead(waitingOn).catch(() => ({ kind: 'waiting' }) as const)
      if (!live || read.kind === 'waiting') return
      clearInterval(timer)
      await endPreviewSetup(currentId)
      if (!live) return
      if (read.kind === 'refused') setError(`Claude's proposal was refused: ${read.error}`)
      else if (read.kind === 'none') setSetupNote(read.reason ? `No browser needed: ${read.reason}` : 'No browser needed: this project has nothing to serve.')
      else if (dirtyRef.current) setSetupNote("Claude's proposal arrived after you changed this page, so it was dropped. Discard your changes and set up again.")
      else {
        setDraft(toDraft(read.config))
        setError(null)
        setSetupNote("Claude's proposal is loaded below, not saved. Check it, then Save.")
      }
    }
    const timer = setInterval(() => void poll(), 1500)
    void poll()
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [currentId, loaded, waitingOn])

  const setUp = async (): Promise<void> => {
    if (!current) return
    setStarting(true)
    setSetupNote(null)
    setError((await startPreviewSetup(current)) ?? null)
    setStarting(false)
  }
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
            {!hasBrowser && (
              <PageGroup title="Set up preview">
                <FormRow
                  label="Have Claude draft it"
                  description="Starts a session in this workspace that reads the project and proposes the install command, servers and start page. The proposal waits here, unsaved, until you press Save."
                  control={
                    waitingOn ? (
                      <Button variant="secondary" onClick={() => void endPreviewSetup(current.id)}>
                        Cancel
                      </Button>
                    ) : (
                      <Button disabled={dirty || starting} onClick={() => void setUp()}>
                        Set up preview
                      </Button>
                    )
                  }
                />
                {waitingOn && <NoticeLine>Claude is reading the project; the proposal appears here when it is written.</NoticeLine>}
                {setupNote && <NoticeLine>{setupNote}</NoticeLine>}
              </PageGroup>
            )}
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
