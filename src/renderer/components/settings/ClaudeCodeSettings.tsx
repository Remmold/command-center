import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_PROFILE_ID, type AccountProfile } from '../../../shared/types'
import { SETTINGS_CATALOG, SETTING_CATEGORIES, changeText, entryFor, entryOf, formatSettingValue, matchesSearch, shownSettings, type SettingCategory, type SettingEntry } from '../../../shared/claudeSettingsCatalog'
import { changeCount, getAt, pathKeys, patchPaths, patchSize, sameValue, withPatch, type SettingsPatch, type ClaudeSettingsRead, type SettingsLayer, type SettingsLayerFile } from '../../../shared/claudeSettings'
import { effectiveSetting, ruleSources, sourceBadge, type LayerSettings } from '../../../shared/claudeSettingsEffective'
import { RULE_LISTS, ruleListKey, ruleListOf, type RuleList } from '../../../shared/permissionRules'
import { shownWorkspace, useClaudeSettingsStore } from '../../state/claudeSettingsStore'
import { conflicts, pendingChanges, type ConflictChoice, type PendingFile } from '../../state/claudeSettingsPending'
import { useContextStore } from '../../state/contextStore'
import { useProfilesStore } from '../../state/profilesStore'
import { setSettingsLeaveGuard, useViewStore } from '../../state/viewStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Dialog, DialogActions } from '../ui/Dialog'
import { FormRow } from '../ui/FormRow'
import { ListRow, ListRowText } from '../ui/ListRow'
import { NoticeLine } from '../ui/NoticeLine'
import { Page, PageBody, PageGroup, PageHeader } from '../ui/Page'
import { PropertyList } from '../ui/PropertyList'
import { SaveBar } from '../ui/SaveBar'
import { SearchField } from '../ui/SearchField'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import { SidebarLayout } from '../ui/SidebarLayout'
import { Toolbar } from '../ui/Toolbar'
import { OtherKeysList } from './OtherKeysList'
import { PermissionRuleList } from './PermissionRuleList'
import { otherKeyRows, otherKeysNotice } from './otherKeysView'
import { SettingField, type ShownEffective } from './SettingField'

/** Names the boxes whose text Save would lose. */
function unparsedNote(keys: readonly string[]): string {
  const names = keys.map((key) => settingWords(key).label).join(', ')
  return `${keys.length === 1 ? 'A box holds' : `${keys.length} boxes hold`} JSON not taken yet: ${names}`
}

const OTHER_KEYS_CATEGORY: SettingCategory = 'Other keys'

const CATEGORIES = SETTING_CATEGORIES.filter((c) => c === OTHER_KEYS_CATEGORY || SETTINGS_CATALOG.some((e) => e.category === c))

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

/** Whether the patch changes the entry's key or a path inside it no other entry owns. */
const touches = (patch: SettingsPatch, entry: SettingEntry): boolean => patchPaths(patch).some((path) => entryOf(path)?.key === entry.key)

function settingWords(key: string): { label: string; format: (value: unknown) => string } {
  const entry = entryOf(key)
  const inside = entry && entry.key !== key ? pathKeys(key.slice(entry.key.length + 1)) : []
  return {
    label: entry ? [entry.label, ...inside].join(' · ') : key,
    format: (value) => (entry ? formatSettingValue(entry, value) : value === undefined ? 'not set' : JSON.stringify(value))
  }
}

function ReviewDialog({ onClose }: { onClose: () => void }) {
  const { pending } = useEditedFile()
  const save = useClaudeSettingsStore((s) => s.save)
  const entries = pendingChanges(pending).map(({ key, before, after }): [string, string] => {
    const { label, format } = settingWords(key)
    const entry = entryOf(key)
    return [label, entry?.key === key ? changeText(entry, before, after) : `${format(before)} → ${format(after)}`]
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
  const unparsed = useClaudeSettingsStore((s) => s.unparsed)
  const discards = useClaudeSettingsStore((s) => s.discards)
  const { load, applyChange, selectLayer, selectProfile, selectWorkspace, stage, markUnparsed, discard, save, confirmLeave, dropAll } = useClaudeSettingsStore.getState()
  const { file, pending } = useEditedFile()
  const [category, setCategory] = useState<SettingCategory>(CATEGORIES[0])
  const [query, setQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [hideTerminalOnly, setHideTerminalOnly] = useState(false)
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
  const groups = useMemo(() => shownSettings({ category, query, showAdvanced, hideTerminalOnly }), [category, query, showAdvanced, hideTerminalOnly])
  const searching = query.trim() !== ''
  const layers = useMemo(() => layersWithPending(read, allPending), [read, allPending])
  const count = pending ? patchSize(pending.patch) : 0
  const fileChanged = useMemo(() => new Map(conflicts(pending, snapshot?.value ?? null).map((c) => [entryOf(c.key)?.key ?? c.key, { value: c.theirs }])), [pending, snapshot])
  const unreadable = snapshot?.value === null
  const otherRows = useMemo(() => {
    const rows = otherKeyRows(snapshot?.value ?? null, layers[layer], pending)
    return searching ? rows.filter((row) => matchesSearch(entryFor(row.path), query)) : rows
  }, [snapshot, layers, layer, pending, searching, query])
  const showOtherKeys = searching ? otherRows.length > 0 : category === OTHER_KEYS_CATEGORY
  const ruleLists = useMemo(() => Object.fromEntries(RULE_LISTS.map((list) => [list, getAt(layers[layer], ruleListKey(list))])) as Record<RuleList, unknown>, [layers, layer])
  const rulesEditor = (entry: SettingEntry) => {
    const list = ruleListOf(entry.key)
    return list && !unreadable && <PermissionRuleList list={list} lists={ruleLists} sources={ruleSources(list, layers)} layer={layer} disabled={!snapshot || unreadable || saving} onStage={stage} />
  }
  const noWorkspace = layer !== 'account' && workspaces.length === 0

  return (
    <Page label="Claude Code">
      <PageHeader title="Claude Code" description="The settings Claude Code reads from its settings files, as plain controls." />
      <Toolbar
        actions={
          <div className="flex items-center gap-3">
            <Checkbox checked={showAdvanced} onChange={setShowAdvanced}>
              Show advanced
            </Checkbox>
            <Checkbox checked={hideTerminalOnly} onChange={setHideTerminalOnly}>
              Hide terminal-only
            </Checkbox>
            <div className="w-56">
              <SearchField label="Search settings" placeholder="Search by name, words or key" value={query} onChange={setQuery} />
            </div>
          </div>
        }
      >
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
                  <ListRow
                    key={c}
                    active={!searching && c === category}
                    onClick={() => {
                      setCategory(c)
                      setQuery('')
                    }}
                  >
                    <ListRowText primary={c} />
                  </ListRow>
                ))}
              </ul>
            </nav>
          }
        >
          {/* A new file or a Discard starts every box afresh, dropping text typed for the file before. */}
          <PageBody key={`${discards}:${file?.path}`}>
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
            {searching && groups.length === 0 && !showOtherKeys && <NoticeLine>No setting matches “{query.trim()}”.</NoticeLine>}
            {groups.map((group) => (
              <PageGroup key={group.category} title={group.category}>
                <div>
                  {group.entries.map((entry) => (
                    <SettingField
                      key={entry.key}
                      entry={entry}
                      layer={layer}
                      value={getAt(layers[layer], entry.key)}
                      effective={shownEffective(entry, layers, layer)}
                      changed={pending !== null && touches(pending.patch, entry)}
                      fileValue={fileChanged.get(entry.key)}
                      disabled={!snapshot || unreadable || saving}
                      onStage={stage}
                      onUnparsed={markUnparsed}
                      editor={rulesEditor(entry)}
                    />
                  ))}
                </div>
              </PageGroup>
            ))}
            {showOtherKeys && (
              <PageGroup title={OTHER_KEYS_CATEGORY}>
                {snapshot && <NoticeLine>{otherKeysNotice(snapshot, otherRows.length)}</NoticeLine>}
                <OtherKeysList rows={otherRows} disabled={!snapshot || unreadable || saving} onStage={stage} onUnparsed={markUnparsed} />
              </PageGroup>
            )}
          </PageBody>
        </SidebarLayout>
      </div>
      {(count > 0 || saveError || unparsed.length > 0) && (
        <SaveBar
          label="Unsaved Claude Code changes"
          summary={unparsed.length > 0 ? `${changeCount(count)} · ${unparsedNote(unparsed)}` : changeCount(count)}
          error={saveError}
          actions={
            <>
              <Button variant="ghost" disabled={count === 0} onClick={() => setReviewing(true)}>
                Review
              </Button>
              {/* Not disabled by a box being typed in: pressing Save leaves the box, which takes JSON that parses. */}
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
