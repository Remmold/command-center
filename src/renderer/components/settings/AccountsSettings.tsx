import { useEffect, useState } from 'react'
import { LogIn, Pencil } from 'lucide-react'
import { DEFAULT_PROFILE_ID, type AccountProfile, type Workspace } from '../../../shared/types'
import { profileEnv } from '../../../shared/profiles'
import { useProfilesStore } from '../../state/profilesStore'
import { openShell } from '../../state/sessionNavigation'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { Button } from '../ui/Button'
import { DrawerList } from '../ui/Drawer'
import { ListItem, ListRowMeta, ListRowText } from '../ui/ListRow'
import { Page, PageBody, PageGroup, PageHeader, PageNote } from '../ui/Page'
import { TextField } from '../ui/TextField'

/** Login needs a shell somewhere; prefer a workspace that already uses the profile. */
function loginWorkspace(workspaces: Workspace[], profile: AccountProfile): Workspace | undefined {
  return workspaces.find((w) => w.profileId === profile.id) ?? workspaces[0]
}

export function AccountsSettings() {
  const profiles = useProfilesStore((s) => s.profiles)
  const load = useProfilesStore((s) => s.load)
  const create = useProfilesStore((s) => s.create)
  const noWorkspaces = useWorkspacesStore((s) => s.workspaces.length === 0)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Page label="Accounts">
      <PageHeader title="Accounts" description="The Claude logins that workspaces can use." />
      <PageBody>
        <PageGroup title="Account profiles">
          <DrawerList>
            {profiles.map((p) => (
              <ProfileItem key={p.id} profile={p} />
            ))}
          </DrawerList>
          <PageNote>
            {noWorkspaces
              ? 'Add a workspace first: logging in opens a shell in one.'
              : 'Log in opens a shell as that profile; run claude and then /login in it.'}
          </PageNote>
        </PageGroup>
        <PageGroup title="New profile">
          <TextField label="new profile name" placeholder="Profile name, then Enter" onSubmit={(name) => void create(name)} />
        </PageGroup>
      </PageBody>
    </Page>
  )
}

function ProfileItem({ profile }: { profile: AccountProfile }) {
  const rename = useProfilesStore((s) => s.rename)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const [renaming, setRenaming] = useState(false)
  const target = loginWorkspace(workspaces, profile)
  const used = workspaces.filter((w) => w.profileId === profile.id).length

  if (renaming) {
    return (
      <ListItem>
        <TextField
          label={`new name for ${profile.name}`}
          initialValue={profile.name}
          autoFocus
          onSubmit={(name) => {
            void rename(profile.id, name)
            setRenaming(false)
          }}
          onCancel={() => setRenaming(false)}
        />
      </ListItem>
    )
  }

  return (
    <ListItem tooltip={profile.configDir}>
      <ListRowText primary={profile.name} secondary={profile.loggedIn ? 'logged in' : 'not logged in'} />
      <ListRowMeta>
        {used} {used === 1 ? 'workspace' : 'workspaces'}
      </ListRowMeta>
      {target && (
        <Button
          variant={profile.loggedIn ? 'ghost' : 'primary'}
          onClick={() => openShell(target, { env: profileEnv(profile) })}
          tooltip={`Open a shell as ${profile.name} in ${target.name}`}
        >
          <LogIn size={12} />
          Log in
        </Button>
      )}
      {profile.id !== DEFAULT_PROFILE_ID && (
        <Button variant="ghost" onClick={() => setRenaming(true)}>
          <Pencil size={12} />
          Rename
        </Button>
      )}
    </ListItem>
  )
}
