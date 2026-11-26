import { create } from 'zustand'
import type { FeatureStageView } from '../../shared/featureStage'
import { featureFirstPrompt, type FeatureRecord, type NewFeatureRequest } from '../../shared/features'
import { startSession } from './sessionNavigation'
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
