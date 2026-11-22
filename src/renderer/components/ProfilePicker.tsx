import { useCallback, useState } from 'react'
import { Check, LogIn, Pencil, UserRound } from 'lucide-react'
import { DEFAULT_PROFILE_ID, type AccountProfile, type Workspace } from '../../shared/types'
import { profileEnv } from '../../shared/profiles'
import { useProfilesStore } from '../state/profilesStore'
import { useWorkspacesStore } from '../state/workspacesStore'
import { openShell } from '../state/sessionNavigation'
import { accountOf } from '../state/accounts'
import { useAccounts } from '../state/useAccounts'
import { Button } from './ui/Button'
import { ListRow, ListRowMeta, ListRowText } from './ui/ListRow'
import { Popover, PopoverActions, PopoverNote, PopoverSection } from './ui/Popover'
import { SectionLabel } from './ui/SectionLabel'
import { TextField } from './ui/TextField'

/** Main runs a workspace whose profile was deleted on Default, so the picker shows it that way. */
function currentProfile(profiles: AccountProfile[], workspace: Workspace): AccountProfile | undefined {
  return profiles.find((p) => p.id === workspace.profileId) ?? profiles.find((p) => p.id === DEFAULT_PROFILE_ID)
}

interface Props {
  workspace: Workspace
  /** Shows the profile's name beside the icon, always visible. */
  labelled?: boolean
}

/** The account profile button on a workspace's row, with its picker. */
export function ProfilePicker({ workspace, labelled = false }: Props) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const profiles = useProfilesStore((s) => s.profiles)
  const load = useProfilesStore((s) => s.load)
  const current = currentProfile(profiles, workspace)
  const account = accountOf(useAccounts(), workspace.profileId)
  const close = useCallback(() => setOpen(false), [])

  const toggle = () => {
    if (!open) void load()
    setOpen(!open)
  }

  const onDefault = workspace.profileId === DEFAULT_PROFILE_ID
  return (
    <>
      <button
        ref={setAnchor}
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
        aria-label={`account profile for ${workspace.name}`}
        title={`account profile: ${account.label}`}
        className={
          'inline-flex shrink-0 items-center gap-1.5 rounded text-muted hover:bg-list-hover hover:text-fg ' +
          (labelled ? 'px-2 py-1 text-xs ' : 'p-0.5 ') +
          (onDefault && !open && !labelled ? 'opacity-0 group-hover:opacity-100' : '')
        }
      >
        <UserRound size={11} strokeWidth={2.25} />
        {labelled && account.name}
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label="account profile">
        <ProfileList workspace={workspace} profiles={profiles} onDone={close} />
      </Popover>
    </>
  )
}

function ProfileList({
  workspace,
  profiles,
  onDone
}: {
  workspace: Workspace
  profiles: AccountProfile[]
  onDone: () => void
}) {
  const setProfile = useWorkspacesStore((s) => s.setProfile)
  const createProfile = useProfilesStore((s) => s.create)
  const renameProfile = useProfilesStore((s) => s.rename)
  const [renaming, setRenaming] = useState(false)
  const current = currentProfile(profiles, workspace)
  const accounts = useAccounts()

  const logIn = (profile: AccountProfile) => {
    openShell(workspace, { env: profileEnv(profile) })
    onDone()
  }

  return (
    <>
      <PopoverSection>
        <SectionLabel>account profile</SectionLabel>
      </PopoverSection>
      <ul>
        {profiles.map((p) => (
          <ListRow key={p.id} onClick={() => void setProfile(workspace.id, p.id)} tooltip={p.configDir}>
            <ListRowText primary={accountOf(accounts, p.id).label} secondary={p.loggedIn ? undefined : 'not logged in'} />
            {p.id === current?.id && (
              <ListRowMeta>
                <Check size={11} strokeWidth={2.25} />
              </ListRowMeta>
            )}
          </ListRow>
        ))}
      </ul>
      {current && (
        <PopoverSection>
          {renaming ? (
            <TextField
              label="new name"
              initialValue={current.name}
              autoFocus
              onSubmit={(name) => {
                void renameProfile(current.id, name)
                setRenaming(false)
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <PopoverActions>
              {!current.loggedIn && (
                <Button onClick={() => logIn(current)} tooltip="open a shell as this profile">
                  <LogIn size={11} strokeWidth={2.25} />
                  Log in
                </Button>
              )}
              {current.id !== DEFAULT_PROFILE_ID && (
                <Button variant="ghost" onClick={() => setRenaming(true)}>
                  <Pencil size={11} strokeWidth={2.25} />
                  Rename
                </Button>
              )}
            </PopoverActions>
          )}
          {!current.loggedIn && (
            <PopoverNote>In the shell, run claude and then /login.</PopoverNote>
          )}
        </PopoverSection>
      )}
      <PopoverSection>
        <TextField
          label="new profile name"
          placeholder="new profile…"
          onSubmit={async (name) => {
            const created = await createProfile(name)
            if (created) await setProfile(workspace.id, created.id)
          }}
        />
        <PopoverNote>Changes apply to the next session started here.</PopoverNote>
      </PopoverSection>
    </>
  )
}
