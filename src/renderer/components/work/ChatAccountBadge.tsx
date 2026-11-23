import { useEffect, useMemo, useState } from 'react'
import type { ObservedSession, Workspace } from '../../../shared/types'
import { vscodeFolderFor } from '../../../shared/vscodeMatch'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { accountMismatch, chatAccountView, hostedChatAccount, observedChatAccount, type ChatAccount } from '../../state/chatAccount'
import { chatKey, usePublishChatAccount } from '../../state/chatAccountStore'
import { useAccountSwitchStore } from '../../state/accountSwitchStore'
import { useProfilesStore } from '../../state/profilesStore'
import { useChatProcess } from '../../state/sessionInitStore'
import { usePaneStatus } from '../../state/sessionStatusStore'
import { useUsageStore } from '../../state/usageStore'
import { useUsageEntries } from '../../state/useUsageEntries'
import { useAccounts } from '../../state/useAccounts'
import { useAccountColor } from '../../state/useAccountColor'
import { useVsCodeMatchStore } from '../../state/vscodeMatchStore'
import { UsageMeters } from '../AccountUsage'
import { AccountBadge } from '../ui/AccountBadge'
import { Button } from '../ui/Button'
import { NoticeLine } from '../ui/NoticeLine'
import { AccountSwitcher } from './AccountSwitcher'

/** The badge's label, colour, bars and hover text for a resolved chat account. */
function useBadge(chat: ChatAccount) {
  const accounts = useAccounts()
  const usage = useUsageStore((s) => s.byProfile)
  const usageAccounts = useMemo(() => Object.fromEntries(Object.entries(usage).map(([id, u]) => [id, u.account])), [usage])
  const view = useMemo(() => chatAccountView(chat, accounts, usageAccounts), [chat, accounts, usageAccounts])
  const color = useAccountColor(chat.profileId)
  const entry = useUsageEntries(null, useMinuteClock()).find((e) => e.profileId === chat.profileId)
  const meters = entry && entry.bars.length > 0 ? <UsageMeters entry={entry} /> : null
  return { view, color, meters }
}

function useHostedChatAccount(workspace: Workspace, paneId: string): ChatAccount {
  const process = useChatProcess(paneId)
  const profiles = useProfilesStore((s) => s.profiles)
  const chat = useMemo(() => hostedChatAccount({ process, workspaceProfileId: workspace.profileId, profiles }), [process, workspace.profileId, profiles])
  usePublishChatAccount(chatKey({ kind: 'hosted', paneId }), chat.profileId)
  return chat
}

/** A hosted chat's account; a click opens the account switch. */
export function HostedAccountBadge({ workspace, paneId }: { workspace: Workspace; paneId: string }) {
  const chat = useHostedChatAccount(workspace, paneId)
  const profiles = useProfilesStore((s) => s.profiles)
  const { view, color, meters } = useBadge(chat)
  const mismatch = accountMismatch(chat, workspace.profileId, profiles) !== null
  return (
    <AccountSwitcher workspace={workspace} paneId={paneId}>
      {(menu) => (
        <AccountBadge
          ref={menu.setAnchor}
          onClick={menu.toggle}
          pressed={menu.open}
          ariaLabel={`Account: ${view.label}`}
          color={color}
          label={view.label}
          qualifier={view.qualifier}
          tooltip={mismatch ? `${view.tooltip}\nThis workspace is now set to another account` : view.tooltip}
          warning={mismatch}
          meters={meters}
        />
      )}
    </AccountSwitcher>
  )
}

/** "Running on Personal; this workspace is set to Work", with a restart on the workspace's account while the chat is idle. */
export function AccountMismatchNotice({ workspace, paneId }: { workspace: Workspace; paneId: string }) {
  const chat = useHostedChatAccount(workspace, paneId)
  const profiles = useProfilesStore((s) => s.profiles)
  const accounts = useAccounts()
  const status = usePaneStatus(paneId)
  const switching = useAccountSwitchStore((s) => s.pending[paneId] ?? null)
  const mismatch = accountMismatch(chat, workspace.profileId, profiles)
  if (!mismatch) return null
  const nameOf = (id: string) => accounts.find((a) => a.profileId === id)?.name ?? 'Default'
  const setTo = nameOf(mismatch.setTo)
  const idle = status === 'idle' || status === 'your-turn'
  const action = switching ? (
    `Restarting on ${switching}…`
  ) : idle ? (
    <Button
      variant="secondary"
      onClick={() => useAccountSwitchStore.getState().request(paneId, setTo)}
      tooltip={`Resume this session on ${setTo}`}
    >
      Restart on {setTo}
    </Button>
  ) : null
  return (
    <NoticeLine tone="warning" strip action={action}>
      Running on {nameOf(mismatch.runningOn)}; this workspace is set to {setTo}
    </NoticeLine>
  )
}

/** The config folder a running CLI has the session in, re-read every few seconds while shown. */
function useLiveConfigDir(sessionId: string, status: ObservedSession['status'] | undefined): string | null {
  const [found, setFound] = useState<{ sessionId: string; dir: string | null } | null>(null)
  useEffect(() => {
    let alive = true
    const read = () =>
      void window.api.observed
        .liveConfigDir(sessionId)
        .then((dir) => alive && setFound({ sessionId, dir }))
        .catch(() => alive && setFound({ sessionId, dir: null }))
    read()
    const timer = setInterval(read, window.api.observed.refreshMs)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [sessionId, status])
  return found?.sessionId === sessionId ? found.dir : null
}

/** A VS Code chat's account: its live process's folder, else probably VS Code's profile for the folder, else unknown. */
export function ObservedAccountBadge({ workspace, sessionId, status }: { workspace: Workspace; sessionId: string; status?: ObservedSession['status'] }) {
  const liveDir = useLiveConfigDir(sessionId, status)
  const profiles = useProfilesStore((s) => s.profiles)
  const folders = useVsCodeMatchStore((s) => s.match?.folders)
  const loadMatch = useVsCodeMatchStore((s) => s.load)
  useEffect(() => {
    if (!folders) void loadMatch()
  }, [folders, loadMatch])
  const chat = useMemo(
    () => observedChatAccount({ liveConfigDir: liveDir, vscodeFolder: folders ? vscodeFolderFor(workspace.path, folders) : undefined, profiles }),
    [liveDir, folders, workspace.path, profiles]
  )
  usePublishChatAccount(chatKey({ kind: 'observed', workspaceId: workspace.id, sessionId }), chat.profileId)
  const { view, color, meters } = useBadge(chat)
  return <AccountBadge ariaLabel={`Account: ${view.label}`} color={color} label={view.label} qualifier={view.qualifier} tooltip={view.tooltip} meters={meters} />
}
