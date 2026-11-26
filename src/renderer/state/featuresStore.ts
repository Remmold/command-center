import { create } from 'zustand'
import type { FeatureStageView } from '../../shared/featureStage'
import { featureFirstPrompt, featureOpenPlan, type FeatureRecord, type NewFeatureRequest } from '../../shared/features'
import type { ChatItem } from '../components/chat/types'
import { useChatItemsStore } from './chatItemsStore'
import { hostedSessions, openSession, startSession } from './sessionNavigation'
import { useProjectViewsStore } from './projectViewsStore'
import { useWorkspacesStore } from './workspacesStore'

interface FeaturesState {
  features: FeatureRecord[]
  /** Each feature's stage by name, as main last read it from the files. */
  stages: Record<string, FeatureStageView>
  dialogOpen: boolean
  load: () => Promise<void>
  openDialog: () => void
  closeDialog: () => void
}

export const useFeaturesStore = create<FeaturesState>((set) => ({
  features: [],
  stages: {},
  dialogOpen: false,
  load: async () => {
    try {
      const [features, stages] = await Promise.all([window.api.features.list(), window.api.features.stages()])
      set({ features, stages })
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
  const sessionId = crypto.randomUUID()
  const made = await window.api.features.create({ ...request, sessionId })
  if (!made.ok) return made.error
  const { feature } = made
  await reload()
  const workspace = useWorkspacesStore.getState().workspaces.find((w) => w.id === feature.workspaceId)
  const started = workspace
    ? startSession(workspace, { send: { id: sessionId, prompt: featureFirstPrompt(feature, request.description) } })
    : false
  if (started) return null
  await window.api.features.discard(feature.name, request.workspaceId)
  await reload()
  return 'The feature session could not start.'
}

/** Follows stage changes from main; call once. */
export function followFeatureStages(): () => void {
  return window.api.features.onStagesChanged((stages) => useFeaturesStore.setState({ stages }))
}

/** Keeps a feature session's Claude id on its record, which is what resumes it once its chat is gone. */
export function rememberFeatureSession(paneId: string, claudeSessionId: string): void {
  const feature = useFeaturesStore.getState().features.find((f) => f.sessionId === paneId)
  if (!feature || feature.claudeSessionId === claudeSessionId) return
  useFeaturesStore.setState((s) => ({ features: s.features.map((f) => (f === feature ? { ...f, claudeSessionId } : f)) }))
  void window.api.features.setClaudeSession(feature.name, claudeSessionId).catch((err) => console.error('failed to save the feature session id', err))
}

/** Shows the feature's session; one whose chat is gone is hosted again, resumed, in the feature's worktree and on its account. Resolves with why it cannot, or null. */
export async function openFeatureSession(feature: FeatureRecord): Promise<string | null> {
  const views = useProjectViewsStore.getState()
  const workspace = useWorkspacesStore.getState().workspaces.find((w) => w.id === feature.workspaceId)
  const hosted = hostedSessions(views.views).some((s) => s.paneId === feature.sessionId)
  const plan = featureOpenPlan(feature, hosted, workspace !== undefined, useFeaturesStore.getState().stages[feature.name]?.missing === true)
  if (plan.kind === 'missing') return plan.reason
  if (plan.kind === 'open') return openSession(feature.sessionId, { focus: false }) ? null : `The session of ${feature.name} was not found.`
  if (!workspace) return null
  if (!views.views[workspace.id]) views.openProject(workspace, { firstSession: false })
  const created = useProjectViewsStore.getState().addClaudeSession(workspace.id, { id: feature.sessionId, claudeSessionId: plan.claudeSessionId })
  if (!created) return `The session of ${feature.name} could not be hosted again.`
  const read = await window.api.observed.read(workspace.id, plan.claudeSessionId)
  if (read.ok) {
    const history: ChatItem[] = read.items
    useChatItemsStore.getState().appendItems(created.id, history)
  }
  openSession(created.id, { focus: false })
  return null
}
