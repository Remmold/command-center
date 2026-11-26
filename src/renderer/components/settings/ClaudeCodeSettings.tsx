import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_PROFILE_ID, type AccountProfile } from '../../../shared/types'
import { SETTINGS_CATALOG, SETTING_CATEGORIES, formatSettingValue, type SettingCategory } from '../../../shared/claudeSettingsCatalog'
import { changeCount, patchSize, type SettingsLayer } from '../../../shared/claudeSettings'
import { useClaudeSettingsStore } from '../../state/claudeSettingsStore'
import { pendingChanges, shownValue, type PendingFile } from '../../state/claudeSettingsPending'
import { useProfilesStore } from '../../state/profilesStore'
import { setSettingsLeaveGuard } from '../../state/viewStore'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { ListRow, ListRowText } from '../ui/ListRow'
import { Page, PageBody, PageGroup, PageHeader, PageNote } from '../ui/Page'
import { PropertyList } from '../ui/PropertyList'
import { SaveBar } from '../ui/SaveBar'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import { SidebarLayout } from '../ui/SidebarLayout'
import { Toolbar } from '../ui/Toolbar'
import { SettingField } from './SettingField'

const CATEGORIES = SETTING_CATEGORIES.filter((c) => SETTINGS_CATALOG.some((e) => e.category === c))

const LAYERS: { value: SettingsLayer; label: string; title?: string; disabled?: boolean }[] = [
  { value: 'account', label: 'Account' },
  { value: 'repo', label: 'Repo', title: 'Coming soon: the workspace’s committed .claude/settings.json', disabled: true },
  { value: 'local', label: 'Local', title: 'Coming soon: the workspace’s .claude/settings.local.json', disabled: true }
]

function accountNote(profile: AccountProfile | undefined, defaultName: string): string {
  if (!profile || profile.id === DEFAULT_PROFILE_ID) return 'Accounts the app made share this file.'
  if (profile.adopted) return 'Its own folder. The app writes to it only when you press Save here.'
  return `Shares ${defaultName}’s settings file: a change here reaches ${defaultName} too.`
}

/** The account file's waiting changes; null when there are none. */
function usePendingOnScreen(): PendingFile | null {
  return useClaudeSettingsStore((s) => (s.read ? s.pending[s.read.account.path] : undefined)) ?? null
}

function ReviewDialog({ onClose }: { onClose: () => void }) {
  const pending = usePendingOnScreen()
  const save = useClaudeSettingsStore((s) => s.save)
  const entries = pendingChanges(pending).map(({ key, before, after }): [string, string] => {
    const entry = SETTINGS_CATALOG.find((e) => e.key === key)
    const format = (value: unknown): string => (entry ? formatSettingValue(entry, value) : value === undefined ? 'not set' : JSON.stringify(value))
    return [entry?.label ?? key, `${format(before)} → ${format(after)}`]
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

export function ClaudeCodeSettings() {
  const profiles = useProfilesStore((s) => s.profiles)
  const loadProfiles = useProfilesStore((s) => s.load)
  const profileId = useClaudeSettingsStore((s) => s.profileId)
  const read = useClaudeSettingsStore((s) => s.read)
  const readError = useClaudeSettingsStore((s) => s.readError)
  const saving = useClaudeSettingsStore((s) => s.saving)
  const saveError = useClaudeSettingsStore((s) => s.saveError)
  const { load, selectProfile, stage, discard, save, confirmLeave, dropAll } = useClaudeSettingsStore.getState()
  const pending = usePendingOnScreen()
  const [category, setCategory] = useState<SettingCategory>(CATEGORIES[0])
  const [reviewing, setReviewing] = useState(false)

  useEffect(() => {
    void loadProfiles()
    void load()
    setSettingsLeaveGuard(confirmLeave)
    return () => {
      setSettingsLeaveGuard(null)
      dropAll()
    }
  }, [loadProfiles, load, confirmLeave, dropAll])

  const account = read?.account
  const snapshot = account?.snapshot
  const profile = profiles.find((p) => p.id === profileId)
  const defaultName = profiles.find((p) => p.id === DEFAULT_PROFILE_ID)?.name ?? 'Personal'
  const rows = useMemo(() => SETTINGS_CATALOG.filter((e) => e.category === category && !e.advanced), [category])
  const count = pending ? patchSize(pending.patch) : 0
  const unreadable = snapshot?.value === null

  return (
    <Page label="Claude Code">
      <PageHeader title="Claude Code" description="The settings Claude Code reads from its settings files, as plain controls." />
      <Toolbar>
        <div className="flex items-center gap-2">
          <SegmentedControl label="Layer" options={LAYERS} value="account" onChange={() => undefined} />
          <Select label="Account" options={profiles.map((p) => ({ value: p.id, label: p.name }))} value={profileId} onChange={selectProfile} />
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
            {account && (
              <PageNote>
                {account.path} · {accountNote(profile, defaultName)}
              </PageNote>
            )}
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
                    value={shownValue(pending, snapshot?.value ?? null, entry.key)}
                    changed={pending !== null && (entry.key in pending.patch.set || pending.patch.remove.includes(entry.key))}
                    disabled={!snapshot || unreadable || saving}
                    onChange={(value) => stage(entry.key, value)}
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
    </Page>
  )
}
