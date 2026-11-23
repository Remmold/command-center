import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { CliModel, ModelDefaults, ModelDefaultsPatch } from '../../shared/types'
import { resolvedDefault } from './modelPicker'

/** What the running CLI reports applying, from `get_settings`. */
export interface AppliedModel {
  /** Full model id, e.g. `claude-opus-5-5`. */
  model?: string
  effort?: string
}

interface ModelState {
  defaults: ModelDefaults
  /** The model list of the last `initialize` of any session, for panes that have not spawned. */
  cachedModels: CliModel[]
  /** The model id Default last resolved to, per profile, for chats whose CLI has not replied yet. */
  defaultByProfile: Record<string, string>
  applied: Record<string, AppliedModel>
  initialized: boolean
  init: () => void
  loadDefaults: () => Promise<void>
  saveDefaults: (patch: ModelDefaultsPatch) => Promise<void>
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
      defaults: { effortByModel: {} },
      cachedModels: [],
      defaultByProfile: {},
      applied: {},
      initialized: false,
      init: () => {
        if (get().initialized) return
        set({ initialized: true })
        void get().loadDefaults()
        window.api.claude.onInit(({ paneId, profileId, init }) => {
          if (init.models.length > 0) set({ cachedModels: init.models })
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
      loadDefaults: async () => {
        try {
          set({ defaults: await window.api.claude.readDefaults() })
        } catch (err) {
          console.error('could not read the model defaults', err)
        }
      },
      saveDefaults: async (patch) => {
        const result = await window.api.claude.saveDefaults(patch)
        if (!result.ok) console.error('model defaults not saved:', result.error)
        await get().loadDefaults()
      },
      refreshApplied: async (paneId) => {
        const res = await window.api.claude.control(paneId, 'get_settings')
        if (!res.ok) return
        set((s) => ({ applied: { ...s.applied, [paneId]: toApplied(res.response) } }))
      }
    }),
    {
      name: 'command-center.models',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ cachedModels: s.cachedModels, defaultByProfile: s.defaultByProfile })
    }
  )
)
