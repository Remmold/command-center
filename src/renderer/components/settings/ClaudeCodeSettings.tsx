import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_PROFILE_ID, type AccountProfile } from '../../../shared/types'
import { SETTINGS_CATALOG, SETTING_CATEGORIES, formatSettingValue, type SettingCategory, type SettingEntry } from '../../../shared/claudeSettingsCatalog'
import { changeCount, patchSize, sameValue, withPatch, type ClaudeSettingsRead, type SettingsLayer, type SettingsLayerFile } from '../../../shared/claudeSettings'
import { effectiveSetting, sourceBadge, type LayerSettings } from '../../../shared/claudeSettingsEffective'
import { shownWorkspace, useClaudeSettingsStore } from '../../state/claudeSettingsStore'
import { conflicts, pendingChanges, shownValue, type ConflictChoice, type PendingFile } from '../../state/claudeSettingsPending'
import { useContextStore } from '../../state/contextStore'
import { useProfilesStore } from '../../state/profilesStore'
import { setSettingsLeaveGuard, useViewStore } from '../../state/viewStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { FormRow } from '../ui/FormRow'
import { ListRow, ListRowText } from '../ui/ListRow'
import { NoticeLine } from '../ui/NoticeLine'
import { Page, PageBody, PageGroup, PageHeader } from '../ui/Page'
import { PropertyList } from '../ui/PropertyList'
import { SaveBar } from '../ui/SaveBar'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import { SidebarLayout } from '../ui/SidebarLayout'
import { Toolbar } from '../ui/Toolbar'
import { SettingField, type ShownEffective } from './SettingField'

const CATEGORIES = SETTING_CATEGORIES.filter((c) => SETTINGS_CATALOG.some((e) => e.category === c))

const LAYERS: { value: SettingsLayer; label: string; title: string }[] = [
  { value: 'account', label: 'Account', title: 'The account’s settings.json, for every workspace on that account' },
  { value: 'repo', label: 'Repo', title: 'The workspace’s committed .claude/settings.json' },
  { value: 'local', label: 'Local', title: 'The workspace’s .claude/settings.local.json' }
]

function accountNote(profile: AccountProfile | undefined, defaultName: string): string {
  if (!profile || profile.id === DEFAULT_PROFILE_ID) return 'Accounts the app made share this file.'
  if (profile.adopted) return 'Its own folder. The app writes to it only when you press Save here.'
  return `Shares ${defaultName}’s settings file: a change here reaches ${defaultName} too.`
}

const LAYER_NOTES: Record<Exclude<SettingsLayer, 'account'>, string> = {
  repo: 'Committed with the repo: everyone who works on it gets these settings.',
  local: 'Applies only to you, in this folder.'
}

function useEditedFile(): { file: SettingsLayerFile | null; pending: PendingFile | null } {
  const file = useClaudeSettingsStore((s) => s.read?.[s.layer] ?? null)
  const pending = useClaudeSettingsStore((s) => (file ? s.pending[file.path] : undefined)) ?? null
  return { file, pending }
}

/** Each layer as it would be with its waiting changes saved. */
function layersWithPending(read: ClaudeSettingsRead | null, pending: Record<string, PendingFile>): LayerSettings {
  const layer = (file: SettingsLayerFile | null) => {
    const value = file?.snapshot.value ?? null
    const waiting = file ? pending[file.path] : undefined
    return value && waiting ? withPatch(value, waiting.patch) : value
  }
  return { organisation: read?.organisation?.snapshot.value ?? null, local: layer(read?.local ?? null), repo: layer(read?.repo ?? null), account: layer(read?.account ?? null) }
}

function shownEffective(entry: SettingEntry, layers: LayerSettings, edited: SettingsLayer): ShownEffective {
  const effective = effectiveSetting(entry, layers)
  return { value: effective.value, locked: effective.locked, badge: sourceBadge(effective, entry, layers, edited) }
}

/** Settings closes and Context opens on the file; nothing happens when unsaved changes are kept. */
function openInContext(workspaceId: string, path: string): void {
  useViewStore.getState().setView('context')
  if (useViewStore.getState().settings === null) useContextStore.getState().showFile(workspaceId, path)
}

function settingWords(key: string): { label: string; format: (value: unknown) => string } {
  const entry = SETTINGS_CATALOG.find((e) => e.key === key)
  return {
    label: entry?.label ?? key,
    format: (value) => (entry ? formatSettingValue(entry, value) : value === undefined ? 'not set' : JSON.stringify(value))
  }
}

function ReviewDialog({ onClose }: { onClose: () => void }) {
  const { pending } = useEditedFile()
  const save = useClaudeSettingsStore((s) => s.save)
  const entries = pendingChanges(pending).map(({ key, before, after }): [string, string] => {
    const { label, format } = settingWords(key)
    return [label, `${format(before)} → ${format(after)}`]
  })
  return (
    <Dialog title="Review changes" onClose={onClose}>
      <PropertyList label="Pending changes" entries={entries} />
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          Back
        </Button>
        <Button
          onClick={() => {
            onClose()
            void save()
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const CHOICES: { value: ConflictChoice; label: string }[] = [
  { value: 'mine', label: 'Keep mine' },
  { value: 'file', label: 'Keep the file’s' }
]

/** Save's question for each waiting key the file changed under; nothing is written until each is answered. */
function ConflictDialog() {
  const { file, pending } = useEditedFile()
  const { settleConflicts, cancelSettling } = useClaudeSettingsStore.getState()
  // Each answer holds the file's value it was given against: if the file changes again, it is asked again.
  const [answers, setAnswers] = useState<Record<string, { choice: ConflictChoice; theirs: unknown }>>({})
  const asked = conflicts(pending, file?.snapshot.value ?? null)
  const choices = Object.fromEntries(
    asked.flatMap(({ key, theirs }) => (answers[key] && sameValue(answers[key].theirs, theirs) ? [[key, answers[key].choice]] : []))
  ) as Record<string, ConflictChoice>
  const answered = asked.every((c) => c.key in choices)
  return (
    <Dialog title="The file changed since your edit" onClose={cancelSettling} maxWidth={560}>
      <p className="mb-2 text-muted">Claude or another program changed these settings in {file?.path} while your changes waited.</p>
      {asked.map(({ key, mine, theirs }) => {
        const { label, format } = settingWords(key)
        return (
          <FormRow
            key={key}
            label={label}
            hint={key}
            description={`Yours: ${format(mine)} · In the file: ${format(theirs)}`}
            control={
              <SegmentedControl label={`Keep for ${label}`} options={CHOICES} value={choices[key] ?? ''} onChange={(choice) => setAnswers({ ...answers, [key]: { choice, theirs } })} />
            }
          />
        )
      })}
      <DialogActions>
        <Button variant="secondary" onClick={cancelSettling}>
          Back
        </Button>
        <Button disabled={!answered} tooltip={answered ? undefined : 'Pick a value for each setting first'} onClick={() => void settleConflicts(choices)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function FileLine({ note }: { note: string }) {
  const { file } = useEditedFile()
  const layer = useClaudeSettingsStore((s) => s.layer)
  const profileId = useClaudeSettingsStore((s) => s.profileId)
  const workspaceId = useClaudeSettingsStore((s) => s.workspaceId)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  if (!file) return null
  const workspace = shownWorkspace({ layer, profileId, workspaceId }, workspaces)
  const missing = file.snapshot.text === null
  return (
    <NoticeLine
      action={
        <Button
          variant="link"
          disabled={!workspace || missing}
          tooltip={missing ? 'Not there yet: Save makes it' : !workspace ? 'No workspace uses this account' : undefined}
          onClick={() => workspace && openInContext(workspace.id, file.path)}
        >
          Open in Context view
        </Button>
      }
    >
      {file.path} · {note}
      {layer === 'account' && workspace && ` What applies is shown for ${workspace.name}.`}
    </NoticeLine>
  )
}

export function ClaudeCodeSettings() {
  const profiles = useProfilesStore((s) => s.profiles)
  const loadProfiles = useProfilesStore((s) => s.load)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const layer = useClaudeSettingsStore((s) => s.layer)
  const profileId = useClaudeSettingsStore((s) => s.profileId)
  const workspaceId = useClaudeSettingsStore((s) => s.workspaceId)
  const read = useClaudeSettingsStore((s) => s.read)
  const allPending = useClaudeSettingsStore((s) => s.pending)
  const readError = useClaudeSettingsStore((s) => s.readError)
  const saving = useClaudeSettingsStore((s) => s.saving)
  const saveError = useClaudeSettingsStore((s) => s.saveError)
  const settling = useClaudeSettingsStore((s) => s.settling)
  const { load, applyChange, selectLayer, selectProfile, selectWorkspace, stage, discard, save, confirmLeave, dropAll } = useClaudeSettingsStore.getState()
  const { file, pending } = useEditedFile()
  const [category, setCategory] = useState<SettingCategory>(CATEGORIES[0])
  const [reviewing, setReviewing] = useState(false)

  useEffect(() => {
    void loadProfiles()
    const stopChanges = window.api.claudeSettings.onChanged(applyChange)
    void load()
    setSettingsLeaveGuard(confirmLeave)
    return () => {
      stopChanges()
      window.api.claudeSettings.unwatch()
      setSettingsLeaveGuard(null)
      dropAll()
    }
  }, [loadProfiles, load, applyChange, confirmLeave, dropAll])

  const snapshot = file?.snapshot
  const profile = profiles.find((p) => p.id === profileId)
  const defaultName = profiles.find((p) => p.id === DEFAULT_PROFILE_ID)?.name ?? 'Personal'
  const rows = useMemo(() => SETTINGS_CATALOG.filter((e) => e.category === category && !e.advanced), [category])
  const layers = useMemo(() => layersWithPending(read, allPending), [read, allPending])
  const count = pending ? patchSize(pending.patch) : 0
  const fileChanged = useMemo(() => new Map(conflicts(pending, snapshot?.value ?? null).map((c) => [c.key, { value: c.theirs }])), [pending, snapshot])
  const unreadable = snapshot?.value === null
  const noWorkspace = layer !== 'account' && workspaces.length === 0

  return (
    <Page label="Claude Code">
      <PageHeader title="Claude Code" description="The settings Claude Code reads from its settings files, as plain controls." />
      <Toolbar>
        <div className="flex items-center gap-2">
          <SegmentedControl label="Layer" options={LAYERS} value={layer} onChange={selectLayer} />
          {layer === 'account' ? (
            <Select label="Account" options={profiles.map((p) => ({ value: p.id, label: p.name }))} value={profileId} onChange={selectProfile} />
          ) : (
            <Select label="Workspace" options={workspaces.map((w) => ({ value: w.id, label: w.name }))} value={workspaceId ?? ''} onChange={selectWorkspace} />
          )}
        </div>
      </Toolbar>
      <div className="min-h-0 flex-1">
        <SidebarLayout
          sidebar={
            <nav aria-label="Claude Code categories">
              <ul className="py-1">
                {CATEGORIES.map((c) => (
                  <ListRow key={c} active={c === category} onClick={() => setCategory(c)}>
                    <ListRowText primary={c} />
                  </ListRow>
                ))}
              </ul>
            </nav>
          }
        >
          <PageBody>
            <FileLine note={layer === 'account' ? accountNote(profile, defaultName) : LAYER_NOTES[layer]} />
            {read?.organisation && <NoticeLine tone="warning">Your organisation’s settings in {read.organisation.path} apply over every layer and can’t be changed here.</NoticeLine>}
            {read?.organisation?.snapshot.error && (
              <Banner label="Organisation settings not read">
                Your organisation’s settings file is {read.organisation.snapshot.error}, so this page can’t show what it sets.
              </Banner>
            )}
            {noWorkspace && <Banner label="No workspace">Add a workspace to edit its Repo and Local settings.</Banner>}
            {readError && <Banner label="Settings not read">Could not read the settings: {readError}</Banner>}
            {unreadable && (
              <Banner label="Settings file does not parse">
                This file is {snapshot?.error}. Fix it in the Context view or an editor; it can&apos;t be saved from this page until it parses.
              </Banner>
            )}
            <PageGroup title={category}>
              <div>
                {rows.map((entry) => (
                  <SettingField
                    key={entry.key}
                    entry={entry}
                    layer={layer}
                    value={shownValue(pending, snapshot?.value ?? null, entry.key)}
                    effective={shownEffective(entry, layers, layer)}
                    changed={pending !== null && (entry.key in pending.patch.set || pending.patch.remove.includes(entry.key))}
                    fileValue={fileChanged.get(entry.key)}
                    disabled={!snapshot || unreadable || saving}
                    onChange={(value) => stage(entry.key, value)}
                    onReset={() => stage(entry.key, undefined)}
                  />
                ))}
              </div>
            </PageGroup>
          </PageBody>
        </SidebarLayout>
      </div>
      {(count > 0 || saveError) && (
        <SaveBar
          label="Unsaved Claude Code changes"
          summary={changeCount(count)}
          error={saveError}
          actions={
            <>
              <Button variant="ghost" disabled={count === 0} onClick={() => setReviewing(true)}>
                Review
              </Button>
              <Button disabled={count === 0 || saving} onClick={() => void save()}>
                Save
              </Button>
              <Button variant="secondary" onClick={discard}>
                Discard
              </Button>
            </>
          }
        />
      )}
      {reviewing && <ReviewDialog onClose={() => setReviewing(false)} />}
      {settling && <ConflictDialog />}
    </Page>
  )
}
