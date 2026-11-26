import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_PROFILE_ID, type CliModel, type ModelDefaults, type ModelDefaultsPatch } from '../../shared/types'
import { resolvedDefault } from './modelPicker'
import { NO_PICKS, recordPick, startingChoice, type LastPicks, type PickChange, type Picked } from './lastPick'

/** What the running CLI reports applying, from `get_settings`. */
export interface AppliedModel {
  /** Full model id, e.g. `claude-opus-5-5`. */
  model?: string
  effort?: string
}

const NO_DEFAULTS: ModelDefaults = { effortByModel: {} }

interface ModelState {
  /** Each profile's own settings.json defaults, as its CLI reads them. */
  settingsByProfile: Record<string, ModelDefaults>
  /** The model list of the last `initialize` of any session, for panes that have not spawned. */
  cachedModels: CliModel[]
  /** The model id Default last resolved to, per profile, for chats whose CLI has not replied yet. */
  defaultByProfile: Record<string, string>
  /** Each profile's last `initialize` model list. */
  modelsByProfile: Record<string, CliModel[]>
  /** The model and effort last picked in a chat, for new chats. */
  picks: LastPicks
  applied: Record<string, AppliedModel>
  initialized: boolean
  init: () => void
  loadDefaults: (profileId: string) => Promise<void>
  saveDefaults: (patch: ModelDefaultsPatch) => Promise<void>
  /** Re-reads every profile's defaults loaded so far, e.g. after their settings files were saved. */
  reloadDefaults: () => Promise<void>
  recordPick: (profileId: string, pick: PickChange) => void
  refreshApplied: (paneId: string) => Promise<void>
}

function toApplied(response: Record<string, unknown>): AppliedModel {
  const applied = response.applied as Record<string, unknown> | undefined
  if (!applied || typeof applied !== 'object') return {}
  const out: AppliedModel = {}
  if (typeof applied.model === 'string') out.model = applied.model
  if (typeof applied.effort === 'string') out.effort = applied.effort
  return out
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      settingsByProfile: {},
      cachedModels: [],
      defaultByProfile: {},
      modelsByProfile: {},
      picks: NO_PICKS,
      applied: {},
      initialized: false,
      init: () => {
        if (get().initialized) return
        set({ initialized: true })
        void get().loadDefaults(DEFAULT_PROFILE_ID)
        window.api.claude.onInit(({ paneId, profileId, init }) => {
          if (init.models.length > 0) {
            set((s) => ({ cachedModels: init.models, modelsByProfile: { ...s.modelsByProfile, [profileId]: init.models } }))
          }
          if (!get().settingsByProfile[profileId]) void get().loadDefaults(profileId)
          const resolved = resolvedDefault(init.models)
          if (resolved && get().defaultByProfile[profileId] !== resolved) {
            set((s) => ({ defaultByProfile: { ...s.defaultByProfile, [profileId]: resolved } }))
          }
          void get().refreshApplied(paneId)
        })
        window.api.claude.onExit(({ paneId }) =>
          set((s) => {
            const { [paneId]: _gone, ...applied } = s.applied
            return { applied }
          })
        )
      },
      loadDefaults: async (profileId) => {
        try {
          const defaults = await window.api.claude.readDefaults(profileId)
          set((s) => ({ settingsByProfile: { ...s.settingsByProfile, [profileId]: defaults } }))
        } catch (err) {
          console.error('could not read the model defaults', err)
        }
      },
      saveDefaults: async (patch) => {
        const result = await window.api.claude.saveDefaults(patch)
        if (!result.ok) console.error('model defaults not saved:', result.error)
        await get().reloadDefaults()
      },
      reloadDefaults: async () => {
        const loaded = new Set([DEFAULT_PROFILE_ID, ...Object.keys(get().settingsByProfile)])
        await Promise.all([...loaded].map((id) => get().loadDefaults(id)))
      },
      recordPick: (profileId, pick) => set((s) => ({ picks: recordPick(s.picks, profileId, pick) })),
      refreshApplied: async (paneId) => {
        const res = await window.api.claude.control(paneId, 'get_settings')
        if (!res.ok) return
        set((s) => ({ applied: { ...s.applied, [paneId]: toApplied(res.response) } }))
      }
    }),
    {
      name: 'command-center.models',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ cachedModels: s.cachedModels, defaultByProfile: s.defaultByProfile, modelsByProfile: s.modelsByProfile, picks: s.picks })
    }
  )
)

export function defaultsOf(settingsByProfile: Record<string, ModelDefaults>, profileId: string | undefined): ModelDefaults {
  return settingsByProfile[profileId ?? DEFAULT_PROFILE_ID] ?? NO_DEFAULTS
}

/** What a chat starting now on the profile begins with; `own` is the chat's stored choice. */
export function startingChoiceOn(profileId: string, own?: Picked): Picked {
  const s = useModelStore.getState()
  return startingChoice({
    picks: s.picks,
    profileId,
    models: s.modelsByProfile[profileId] ?? [],
    defaults: defaultsOf(s.settingsByProfile, profileId),
    own
  })
}
