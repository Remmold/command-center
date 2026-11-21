import { Check, UserRound } from 'lucide-react'
import { DEFAULT_PROFILE_ID, type Workspace } from '../../../shared/types'
import { useMenu } from '../../hooks/useMenu'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { useAccountSwitchStore } from '../../state/accountSwitchStore'
import { useProfilesStore } from '../../state/profilesStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { useUsageEntries } from '../../state/useUsageEntries'
import { Button } from '../ui/Button'
import { ListRow, ListRowMeta, ListRowText } from '../ui/ListRow'
import { Popover, PopoverHeading, PopoverNote, PopoverSection } from '../ui/Popover'

interface Props {
  workspace: Workspace
  paneId: string
}

/** The chat header's account dropdown: moves the workspace to another profile and restarts this chat on it. */
export function AccountSwitcher({ workspace, paneId }: Props) {
  const menu = useMenu()
  const loadProfiles = useProfilesStore((s) => s.load)
  const setProfile = useWorkspacesStore((s) => s.setProfile)
  const requestSwitch = useAccountSwitchStore((s) => s.request)
  const switching = useAccountSwitchStore((s) => s.pending[paneId] ?? null)
  const entries = useUsageEntries(null, useMinuteClock())
  const current =
    entries.find((e) => e.profileId === workspace.profileId) ?? entries.find((e) => e.profileId === DEFAULT_PROFILE_ID)

  const toggle = () => {
    if (!menu.open) void loadProfiles()
    menu.toggle()
  }

  const choose = async (profileId: string, label: string) => {
    menu.close()
    if (profileId === current?.profileId) return
    await setProfile(workspace.id, profileId)
    requestSwitch(paneId, label)
  }

  const label = current?.label ?? 'Default'
  return (
    <>
      <Button
        ref={menu.setAnchor}
        variant="ghost"
        pressed={menu.open}
        onClick={toggle}
        label={`account profile for ${workspace.name}`}
        tooltip={switching ? `Switching to ${switching} after this turn` : `Account profile: ${label}${current?.plan ? ` · ${current.plan}` : ''}`}
      >
        <UserRound size={12} strokeWidth={2.25} />
        {switching ? `${switching}…` : label}
      </Button>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} width={320} label="account profile">
        <PopoverHeading title="Account profile" />
        <ul>
          {entries.map((e) => (
            <ListRow
              key={e.profileId}
              disabled={e.state === 'not-logged-in'}
              onClick={() => void choose(e.profileId, e.label)}
              tooltip={e.label === e.profileName ? e.profileName : `${e.profileName} · ${e.label}`}
            >
              <ListRowText primary={e.label} secondary={e.state === 'not-logged-in' ? 'not logged in' : (e.plan ?? undefined)} />
              {e.profileId === current?.profileId && (
                <ListRowMeta>
                  <Check size={11} strokeWidth={2.25} />
                </ListRowMeta>
              )}
            </ListRow>
          ))}
        </ul>
        <PopoverSection>
          <PopoverNote>
            This session restarts on the profile you pick, after its current turn. Other sessions in {workspace.name} switch when they next start.
          </PopoverNote>
        </PopoverSection>
      </Popover>
    </>
  )
}
