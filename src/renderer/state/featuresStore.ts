import { create } from 'zustand'
import type { FeatureServersView } from '../../shared/featureServers'
import type { FeatureStageView } from '../../shared/featureStage'
import { MAIN_CHAT_PANE_ID } from '../../shared/mainChat'
import { onePerName } from './proposalGo'
import { sendToChat } from './startRequests'
import { adoptFailureReport, adoptedFirstPrompt, movedWorkPrompt, type AdoptRequest } from '../../shared/adoptWork'
import { failureReport, featureFirstPrompt, featureOpenPlan, type FeatureRecord, type NewFeatureRequest } from '../../shared/features'
import type { ChatItem } from '../components/chat/types'
import { useChatItemsStore } from './chatItemsStore'
import { hostedSessions, openSession, startSession } from './sessionNavigation'
import { useProjectViewsStore } from './projectViewsStore'
import { useToastStore } from './toastStore'
import { useWorkspacesStore } from './workspacesStore'

interface FeaturesState {
  features: FeatureRecord[]
  /** Each feature's stage by name, as main last read it from the files. */
  stages: Record<string, FeatureStageView>
  /** Each started feature's servers by name. */
  servers: Record<string, FeatureServersView>
  /** Features whose New feature install command is running now, by name. */
  installing: Record<string, boolean>
  /** Starts under way, from New feature or a proposal's Go; the main chat's Reset waits for them. */
  starting: number
  dialogOpen: boolean
  load: () => Promise<void>
  openDialog: () => void
  closeDialog: () => void
}

export const useFeaturesStore = create<FeaturesState>((set) => ({
  features: [],
  stages: {},
  servers: {},
  installing: {},
  starting: 0,
  dialogOpen: false,
  load: async () => {
    try {
      const [features, stages, servers] = await Promise.all([window.api.features.list(), window.api.features.stages(), window.api.features.servers()])
      set({ features, stages, servers })
    } catch (err) {
      console.error('failed to load features', err)
    }
  },
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false })
}))

/** Panes of feature sessions: the Features group shows them, the ordinary list does not. */
export function featurePanes(features: readonly FeatureRecord[]): ReadonlySet<string> {
  return new Set(features.map((f) => f.sessionId))
}

async function reload(): Promise<void> {
  await useWorkspacesStore.getState().load()
  await useFeaturesStore.getState().load()
}

/**
 * Makes the feature and starts its session, sent `/flow` at once. Resolves with why it failed, or null; a feature
 * whose session did not start is undone.
 */
export async function startFeature(request: Omit<NewFeatureRequest, 'sessionId'>): Promise<string | null> {
  const count = (by: number): void => useFeaturesStore.setState((s) => ({ starting: Math.max(0, s.starting + by) }))
  count(1)
  try {
    return await makeAndStart(request)
  } finally {
    count(-1)
  }
}

async function makeAndStart(request: Omit<NewFeatureRequest, 'sessionId'>): Promise<string | null> {
  const sessionId = crypto.randomUUID()
  const made = await window.api.features.create({ ...request, sessionId })
  if (!made.ok) return made.error
  const { feature, previewBrowser } = made
  await reload()
  const workspace = useWorkspacesStore.getState().workspaces.find((w) => w.id === feature.workspaceId)
  const started = workspace
    ? startSession(workspace, { send: { id: sessionId, prompt: featureFirstPrompt(feature, request.description, previewBrowser, made.briefPath) } })
    : false
  if (started) return null
  const left = await window.api.features.discard(feature.name, request.workspaceId).catch(() => [`the feature ${feature.name} with its worktree, branch and workspace entry (the undo itself failed)`])
  await reload()
  return failureReport('session', 'the session did not start', left)
}

/** Go on a proposal card: the same start as New feature, with the brief; a press while the same name is starting does nothing. */
export const goProposal = onePerName(startFeature)

/** Sends the main chat one line about how a card's action ended, the way a typed prompt is sent. The action is already final: a send that fails only shows a toast. */
export function tellMainChat(text: string): void {
  const unreached = (): void => useToastStore.getState().show('The main chat could not be told how the action ended; the card shows the outcome.')
  sendToChat(MAIN_CHAT_PANE_ID, text).then((reached) => (reached ? undefined : unreached()), unreached)
}

/** Follows stage changes from main; call once. */
export function followFeatureStages(): () => void {
  const api = window.api.features
  const unsubscribe = [
    api.onStagesChanged((stages) => useFeaturesStore.setState({ stages })),
    api.onServersChanged((name, view) => useFeaturesStore.setState((s) => ({ servers: { ...s.servers, [name]: view } }))),
    api.onInstalling((name, running) => useFeaturesStore.setState((s) => ({ installing: { ...s.installing, [name]: running } })))
  ]
  return () => unsubscribe.forEach((u) => u())
}

/** Starts, retries or stops a feature's servers; a refusal shows as a toast. */
export function startFeatureServers(name: string): void {
  void window.api.features.startServers(name).then((r) => {
    if (!r.ok) useToastStore.getState().show(r.error)
    else if (r.note) useToastStore.getState().show(r.note)
  })
}

/** The Test button: boots the servers and opens the test pair; a refusal or a failed server shows as a toast. */
export function testFeature(name: string): void {
  void window.api.features.test(name).then((r) => {
    if (!r.ok) useToastStore.getState().show(r.error)
  })
}

async function settle(done: Promise<{ ok: true } | { ok: false; error: string }>): Promise<boolean> {
  const result = await done
  if (!result.ok) useToastStore.getState().show(result.error)
  await reload()
  return result.ok
}

/** Complete: the servers, windows and browser store go, the feature moves under Completed; the worktree stays. */
export const completeFeature = (name: string): Promise<boolean> => settle(window.api.features.complete(name))

/** A completed feature returns to its stage with fresh ports. */
export const reopenFeature = (name: string): Promise<boolean> => settle(window.api.features.reopen(name))

/** Removes a completed feature's worktree; main refuses while its branch has unmerged commits. */
export const removeFeatureWorktree = (name: string): Promise<boolean> => settle(window.api.features.removeWorktree(name))

export function retryFeatureServer(name: string, server: string): void {
  void window.api.features.retryServer(name, server).then((r) => {
    if (!r.ok) useToastStore.getState().show(r.error)
    else if (r.note) useToastStore.getState().show(r.note)
  })
}

export function stopFeatureServers(name: string): void {
  void window.api.features.stopServers(name)
}

/** Keeps a feature session's Claude id on its record, which is what resumes it once its chat is gone. */
export function rememberFeatureSession(paneId: string, claudeSessionId: string): void {
  const feature = useFeaturesStore.getState().features.find((f) => f.sessionId === paneId)
  if (!feature || feature.claudeSessionId === claudeSessionId) return
  useFeaturesStore.setState((s) => ({ features: s.features.map((f) => (f === feature ? { ...f, claudeSessionId } : f)) }))
  void window.api.features.setClaudeSession(feature.name, claudeSessionId).catch((err) => console.error('failed to save the feature session id', err))
}

/** The open plan of a feature's session as the stores see it now. */
function openPlanOf(feature: FeatureRecord) {
  const views = useProjectViewsStore.getState()
  const workspace = useWorkspacesStore.getState().workspaces.find((w) => w.id === feature.workspaceId)
  const hosted = hostedSessions(views.views).some((s) => s.paneId === feature.sessionId)
  return { workspace, plan: featureOpenPlan(feature, hosted, workspace !== undefined, useFeaturesStore.getState().stages[feature.name]?.missing === true) }
}

/** The transcript of a resumed session; one adopted from the main checkout still lives under its old folder, the source workspace's. */
async function readHistory(feature: FeatureRecord, workspaceId: string, claudeSessionId: string): Promise<ChatItem[]> {
  const read = await window.api.observed.read(workspaceId, claudeSessionId)
  if (read.ok) return read.items
  const moved = feature.sourceWorkspaceId && feature.sourceWorkspaceId !== workspaceId ? await window.api.observed.read(feature.sourceWorkspaceId, claudeSessionId) : null
  if (moved?.ok) return moved.items
  return [{ kind: 'system', id: crypto.randomUUID(), text: `Could not read this session's transcript (${read.error}); Claude still has the whole conversation.`, at: Date.now() }]
}

/** Hosts the feature's session again, resumed, in the feature's worktree and on its account, without showing it. Resolves with why it cannot, or null; null too when it is hosted already. */
export async function hostFeatureSession(feature: FeatureRecord): Promise<string | null> {
  const { workspace, plan } = openPlanOf(feature)
  if (plan.kind === 'missing') return plan.reason
  if (plan.kind === 'open' || !workspace) return null
  const views = useProjectViewsStore.getState()
  if (!views.views[workspace.id]) views.openProject(workspace, { firstSession: false })
  const created = useProjectViewsStore.getState().addClaudeSession(workspace.id, { id: feature.sessionId, claudeSessionId: plan.claudeSessionId })
  if (!created) return `The session of ${feature.name} could not be hosted again.`
  useChatItemsStore.getState().appendItems(created.id, await readHistory(feature, workspace.id, plan.claudeSessionId))
  return null
}

/** Shows the feature's session; one whose chat is gone is hosted again first. Resolves with why it cannot, or null. */
export async function openFeatureSession(feature: FeatureRecord): Promise<string | null> {
  const { plan } = openPlanOf(feature)
  if (plan.kind === 'missing') return plan.reason
  if (plan.kind === 'open') return openSession(feature.sessionId, { focus: false }) ? null : `The session of ${feature.name} was not found.`
  const hosted = await hostFeatureSession(feature)
  if (hosted) return hosted
  openSession(feature.sessionId, { focus: false })
  return null
}

/** Whether a message can reach the feature's session: hosted now, or resumable. Null when it can, else why not. */
export function featureSessionProblem(feature: FeatureRecord): string | null {
  const { plan } = openPlanOf(feature)
  return plan.kind === 'missing' ? plan.reason : null
}

/** Sends a message to the feature's session exactly as if typed there, hosting a closed one again (resumed) first. Resolves with why it was not delivered, or null. */
export async function sendToFeature(feature: FeatureRecord, text: string): Promise<string | null> {
  const hosted = await hostFeatureSession(feature)
  if (hosted) return hosted
  const reached = await sendToChat(feature.sessionId, text).catch(() => false)
  return reached ? null : `the session of ${feature.name} did not start, so it did not take the message.`
}

/**
 * Makes open work a feature, then starts its session in Work without showing it: resumed when a Claude session was
 * found for the folder (told where the work moved, when it moved), else new and told to read the notes first. A
 * session that cannot start undoes the adopt. Resolves with the outcome, or why it failed.
 */
export async function adoptOpenWork(request: AdoptRequest): Promise<{ ok: true; feature: FeatureRecord; resumed: string | null } | { ok: false; error: string }> {
  const sessionId = crypto.randomUUID()
  const made = await window.api.features.adopt({ ...request, sessionId })
  if (!made.ok) return made
  const { feature, preview } = made
  await reload()
  const workspace = useWorkspacesStore.getState().workspaces.find((w) => w.id === feature.workspaceId)
  let started = false
  if (workspace && preview.session) {
    started = (await hostFeatureSession(feature)) === null
    if (started && preview.kind === 'main-checkout') void sendToChat(sessionId, movedWorkPrompt(feature, preview.mainPath, preview.mainBranch))
  } else if (workspace) {
    started = startSession(workspace, { send: { id: sessionId, prompt: adoptedFirstPrompt(feature) } })
  }
  if (started) return { ok: true, feature, resumed: preview.session?.id ?? null }
  const left = await window.api.features.undoAdopt(feature.name).catch(() => [`the feature ${feature.name} and what adopting changed (the undo itself failed)`])
  await reload()
  return { ok: false, error: adoptFailureReport(feature.branch, 'session', 'the session did not start', left) }
}
