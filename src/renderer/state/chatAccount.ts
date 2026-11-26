import { DEFAULT_PROFILE_ID, type CliAccount, type VsCodeFolderAccount } from '../../shared/types'
import { sameDir } from '../../shared/vscodeMatch'
import { planName, sectionTitle } from './accounts'

/**
 * Where a chat's account comes from: the CLI's `initialize` reply, the profile its process started on
 * (or will start on) before that reply, VS Code's running process file, VS Code's folder association, or nothing.
 */
export type ChatAccountSource = 'reported' | 'pending' | 'live' | 'probably' | 'unknown'

export interface ChatAccount {
  /** The app's account; null when no account uses the folder, or nothing is known. */
  profileId: string | null
  source: ChatAccountSource
  email: string | null
  organization: string | null
  plan: string | null
  configDir: string | null
  /** The VS Code profile a `probably` guess came from. */
  vscodeProfileName?: string
}

interface ProfileRef {
  id: string
  configDir: string
}

/** The process a hosted chat's pane runs: the profile it started on, and the account its `initialize` reported. */
export interface ChatProcess {
  profileId: string
  account: CliAccount | null
}

/** Main runs an unknown profile on Default; before the list has loaded, nothing is known yet. */
function resolve(profiles: readonly ProfileRef[], id: string): ProfileRef | undefined {
  if (profiles.length === 0) return undefined
  return profiles.find((p) => p.id === id) ?? profiles.find((p) => p.id === DEFAULT_PROFILE_ID)
}

export function hostedChatAccount(input: {
  process: ChatProcess | null
  workspaceProfileId: string
  profiles: readonly ProfileRef[]
}): ChatAccount {
  const startId = input.process?.profileId ?? input.workspaceProfileId
  const profile = resolve(input.profiles, startId)
  const reported = input.process?.account ?? null
  return {
    profileId: profile?.id ?? startId,
    source: reported ? 'reported' : 'pending',
    email: reported?.email ?? null,
    organization: reported?.organization ?? null,
    plan: planName(reported?.subscriptionType),
    configDir: profile?.configDir ?? null
  }
}

export function observedChatAccount(input: {
  /** The config folder whose `sessions/<pid>.json` names the session with a live process. */
  liveConfigDir: string | null
  vscodeFolder: VsCodeFolderAccount | undefined
  profiles: readonly ProfileRef[]
}): ChatAccount {
  const blank = { email: null, organization: null, plan: null }
  const owner = (dir: string) => input.profiles.find((p) => sameDir(p.configDir, dir))?.id ?? null
  if (input.liveConfigDir) return { ...blank, profileId: owner(input.liveConfigDir), source: 'live', configDir: input.liveConfigDir }
  const folder = input.vscodeFolder
  if (folder) {
    return { ...blank, profileId: owner(folder.configDir), source: 'probably', configDir: folder.configDir, vscodeProfileName: folder.profileName }
  }
  return { ...blank, profileId: null, source: 'unknown', configDir: null }
}

export interface AccountMismatch {
  runningOn: string
  setTo: string
}

/** A hosted chat whose process runs on another account than its workspace is now set to. */
export function accountMismatch(chat: ChatAccount, workspaceProfileId: string, profiles: readonly ProfileRef[]): AccountMismatch | null {
  if (chat.source !== 'reported' && chat.source !== 'pending') return null
  const setTo = resolve(profiles, workspaceProfileId)?.id ?? workspaceProfileId
  if (!chat.profileId || chat.profileId === setTo) return null
  return { runningOn: chat.profileId, setTo }
}

export interface ChatAccountView {
  label: string
  /** Shown before the label: the account is not yet confirmed, or a guess. */
  qualifier: 'pending' | 'probably' | null
  tooltip: string
}

const SOURCE_TEXT: Record<ChatAccountSource, string> = {
  reported: 'Reported by Claude',
  pending: 'Pending: the account this chat starts on, until Claude reports it',
  live: 'From the running VS Code session',
  probably: 'Probably',
  unknown: 'Unknown account: no running VS Code session and no VS Code profile for this folder'
}

interface NamedAccount {
  profileId: string
  name: string
  plan: string | null
}

/** The chat-header badge's words; the email and organisation fall back to what the usage check read. */
export function chatAccountView(
  chat: ChatAccount,
  accounts: readonly NamedAccount[],
  usageAccounts: Readonly<Record<string, { email?: string; organization?: string } | null | undefined>>
): ChatAccountView {
  const account = chat.profileId ? accounts.find((a) => a.profileId === chat.profileId) : undefined
  const known = chat.profileId ? usageAccounts[chat.profileId] : undefined
  const plan = chat.plan ?? account?.plan ?? null
  const name = account?.name ?? 'Unknown account'
  const label = account ? sectionTitle({ name, plan }) : name
  const email = chat.email ?? known?.email
  const organization = chat.organization ?? known?.organization
  const source = chat.source === 'probably' ? `Probably: VS Code profile ${chat.vscodeProfileName ?? ''}`.trim() : SOURCE_TEXT[chat.source]
  const lines = [
    account && plan ? `${name} · ${plan}` : name,
    ...(email ? [`Email: ${email}`] : []),
    ...(organization ? [`Organization: ${organization}`] : []),
    ...(chat.configDir ? [`Config folder: ${chat.configDir}`] : []),
    source
  ]
  const qualifier = chat.source === 'pending' || chat.source === 'probably' ? chat.source : null
  return { label, qualifier, tooltip: lines.join('\n') }
}
