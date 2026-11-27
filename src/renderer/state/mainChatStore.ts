import { create } from 'zustand'
import { MAIN_CHAT_PANE_ID, MAIN_CHAT_TITLE, mainChatFirstPrompt, type JustStarted, type MainChatInfo } from '../../shared/mainChat'
import type { Workspace } from '../../shared/types'
import type { ChatItem } from '../components/chat/types'
import { useChatItemsStore } from './chatItemsStore'
import { useDoneActionsStore } from './doneActionsStore'
import { useFreshStartStore } from './freshStartStore'
import { useProjectViewsStore } from './projectViewsStore'
import { hostedSessions, openSession, startSession } from './sessionNavigation'
import { useToastStore } from './toastStore'

interface MainChatState {
  info: MainChatInfo | null
  load: () => Promise<void>
}

export const useMainChatStore = create<MainChatState>((set) => ({
  info: null,
  load: async () => {
    try {
      set({ info: await window.api.mainChat.info() })
    } catch (err) {
      console.error('failed to load the main chat', err)
    }
  }
}))

/** The main chat's workspace as the views know it; main keeps it out of the workspace list. */
export function mainChatWorkspace(info: MainChatInfo): Workspace {
  return { id: info.workspaceId, name: MAIN_CHAT_TITLE, path: info.path, createdAt: 0, profileId: info.profileId, repoGroupKey: info.path, repoName: MAIN_CHAT_TITLE, worktreeTag: '' }
}

const isHosted = (): boolean => hostedSessions(useProjectViewsStore.getState().views).some((s) => s.paneId === MAIN_CHAT_PANE_ID)

/**
 * Shows the main chat. One not hosted yet is hosted now: resumed with its history when Claude gave it an id, else started
 * with its first prompt. Its process starts only now, so an app that never opens it never spends on it.
 */
export async function openMainChat(): Promise<void> {
  try {
    const info = await window.api.mainChat.info()
    useMainChatStore.setState({ info })
    if (isHosted()) {
      openSession(MAIN_CHAT_PANE_ID)
      return
    }
    const workspace = mainChatWorkspace(info)
    const views = useProjectViewsStore.getState()
    if (!views.views[workspace.id]) views.openProject(workspace, { firstSession: false })
    if (!info.claudeSessionId) {
      if (startSession(workspace, { send: { id: MAIN_CHAT_PANE_ID, prompt: mainChatFirstPrompt(info.digestFile, info.justStarted) } })) openSession(MAIN_CHAT_PANE_ID)
      return
    }
    const created = useProjectViewsStore.getState().addClaudeSession(workspace.id, { id: MAIN_CHAT_PANE_ID, claudeSessionId: info.claudeSessionId })
    if (!created) return
    const read = await window.api.observed.read(workspace.id, info.claudeSessionId)
    const history: ChatItem[] = read.ok
      ? read.items
      : [{ kind: 'system', id: crypto.randomUUID(), text: `Could not read this session's transcript (${read.error}); Claude still has the whole conversation.`, at: Date.now() }]
    useChatItemsStore.getState().appendItems(created.id, history)
    openSession(created.id)
  } catch (err) {
    console.error('failed to open the main chat', err)
    useToastStore.getState().show('The main chat could not be opened.')
  }
}

/** Keeps the main chat's Claude id in main, which is what resumes it after a restart. */
export function rememberMainChatSession(paneId: string, claudeSessionId: string): void {
  if (paneId !== MAIN_CHAT_PANE_ID || useMainChatStore.getState().info?.claudeSessionId === claudeSessionId) return
  useMainChatStore.setState((s) => (s.info ? { info: { ...s.info, claudeSessionId } } : s))
  void window.api.mainChat.setClaudeSession(claudeSessionId).catch((err) => console.error('failed to save the main chat session id', err))
}

/**
 * Starts the main chat on a new Claude session; after a Go, its first prompt names the feature just started. A hosted chat
 * restarts in place, keeping its pane (ADR 0004): it stops its process first, so no late event from the old one saves the
 * old id back, and only then is the stored id forgotten. A chat not hosted starts fresh when next opened.
 */
export async function resetMainChat(justStarted?: JustStarted): Promise<void> {
  const prepare = async (): Promise<string> => {
    const info = await window.api.mainChat.reset(justStarted)
    useMainChatStore.setState({ info })
    useDoneActionsStore.getState().forget()
    return mainChatFirstPrompt(info.digestFile, info.justStarted)
  }
  if (isHosted()) useFreshStartStore.getState().request(MAIN_CHAT_PANE_ID, { prepare })
  else await prepare()
}

/** Settings: runs the main chat on another account; its old conversation stays in the old account's folder, so a new one starts. */
export async function chooseMainChatAccount(profileId: string): Promise<void> {
  const info = await window.api.mainChat.setProfile(profileId)
  const hosted = isHosted()
  const { views } = useProjectViewsStore.getState()
  if (hosted) useProjectViewsStore.getState().closeClaudeSession(info.workspaceId, MAIN_CHAT_PANE_ID)
  if (views[info.workspaceId]) useProjectViewsStore.getState().closeProject(info.workspaceId)
  useDoneActionsStore.getState().forget()
  useMainChatStore.setState({ info })
}
