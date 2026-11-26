import { useEffect, useState } from 'react'
import { FolderOpen, LogIn, Pencil, Plus, Trash2 } from 'lucide-react'
import { DEFAULT_PROFILE_ID, type AccountProfile, type VsCodeConfigDir } from '../../../shared/types'
import { profileEnv, removalConfirmText } from '../../../shared/profiles'
import { loginWorkspace, useProfilesStore } from '../../state/profilesStore'
import { openShell } from '../../state/sessionNavigation'
import { useAccounts } from '../../state/useAccounts'
import { chooseMainChatAccount, useMainChatStore } from '../../state/mainChatStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { Button } from '../ui/Button'
import { DrawerList } from '../ui/Drawer'
import { ListItem, ListRowMeta, ListRowText } from '../ui/ListRow'
import { NoticeLine } from '../ui/NoticeLine'
import { Page, PageBody, PageGroup, PageHeader, PageNote } from '../ui/Page'
import { Select } from '../ui/Select'
import { TextField } from '../ui/TextField'
import { VsCodeAccountsBanner } from '../VsCodeAccountsBanner'
import { AccountColorPicker } from './AccountColorPicker'

export function AccountsSettings() {
  const profiles = useProfilesStore((s) => s.profiles)
  const load = useProfilesStore((s) => s.load)
  const create = useProfilesStore((s) => s.create)
  const chooseFolder = useProfilesStore((s) => s.chooseFolder)
  const suggestions = useProfilesStore((s) => s.suggestions)
  const adoptError = useProfilesStore((s) => s.adoptError)
  const noWorkspaces = useWorkspacesStore((s) => s.workspaces.length === 0)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Page label="Accounts">
      <PageHeader title="Accounts" description="The Claude logins that workspaces can use." />
      <PageBody>
        <VsCodeAccountsBanner />
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
        <MainChatAccount />
        <PageGroup
          title="New profile"
          actions={
            <Button variant="secondary" onClick={() => void chooseFolder()} tooltip="Add an account from a Claude config folder that already exists">
              <FolderOpen size={12} />
              Use existing folder…
            </Button>
          }
        >
          <TextField label="new profile name" placeholder="Profile name, then Enter" onSubmit={(name) => void create(name)} />
          {adoptError && <NoticeLine>{adoptError}</NoticeLine>}
        </PageGroup>
        {suggestions.length > 0 && (
          <PageGroup title="Existing folders">
            <DrawerList>
              {suggestions.map((s) => (
                <SuggestionItem key={s.configDir} suggestion={s} />
              ))}
            </DrawerList>
          </PageGroup>
        )}
      </PageBody>
    </Page>
  )
}

/** The account the main chat runs on; features on other accounts are still read through their files. */
function MainChatAccount() {
  const profiles = useProfilesStore((s) => s.profiles)
  const info = useMainChatStore((s) => s.info)
  const load = useMainChatStore((s) => s.load)
  useEffect(() => {
    void load()
  }, [load])
  if (!info) return null
  return (
    <PageGroup title="Main chat">
      <Select
        label="main chat account"
        options={profiles.map((p) => ({ value: p.id, label: p.name }))}
        value={info.profileId}
        onChange={(profileId) => void chooseMainChatAccount(profileId)}
      />
      <PageNote>The account the main chat runs on, the Default account until chosen. Changing it starts a new main chat conversation: the old one stays in the old account's folder.</PageNote>
    </PageGroup>
  )
}

function SuggestionItem({ suggestion }: { suggestion: VsCodeConfigDir }) {
  const adopt = useProfilesStore((s) => s.adopt)
  return (
    <ListItem tooltip={suggestion.configDir}>
      <ListRowText primary={suggestion.configDir} secondary={`Found in VS Code profile ${suggestion.profileName}`} />
      <Button variant="secondary" onClick={() => void adopt(suggestion.configDir)} tooltip={`Add ${suggestion.configDir} as an account`}>
        <Plus size={12} />
        Add
      </Button>
    </ListItem>
  )
}

function ProfileItem({ profile }: { profile: AccountProfile }) {
  const rename = useProfilesStore((s) => s.rename)
  const remove = useProfilesStore((s) => s.remove)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const email = useAccounts().find((a) => a.profileId === profile.id)?.email ?? null
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
    <ListItem tooltip={email ? `${email}\n${profile.configDir}` : profile.configDir}>
      <ListRowText
        primary={profile.name}
        secondary={[profile.loggedIn ? 'logged in' : 'not logged in', profile.adopted && 'existing folder', email].filter(Boolean).join(' · ')}
      />
      <ListRowMeta>
        {used} {used === 1 ? 'workspace' : 'workspaces'}
      </ListRowMeta>
      <AccountColorPicker profileId={profile.id} name={profile.name} />
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
      <Button variant="ghost" onClick={() => setRenaming(true)} tooltip="The short name shown in the Work list, chat headers and usage pills">
        <Pencil size={12} />
        Rename
      </Button>
      {profile.id !== DEFAULT_PROFILE_ID && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(removalConfirmText(profile))) void remove(profile.id)
          }}
          tooltip={`Forget ${profile.name}; its folder stays on disk`}
        >
          <Trash2 size={12} />
          Remove
        </Button>
      )}
    </ListItem>
  )
}
