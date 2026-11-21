import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface ModelTokens {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export interface RateLimitInfo {
  status: string
  resetsAt: number
  rateLimitType: string
  overageStatus?: string
  overageResetsAt?: number
  isUsingOverage?: boolean
}

interface SessionUsage {
  costUsd: number
  durationMs: number
  turns: number
  tokensByModel: Record<string, ModelTokens>
}

interface UsageState {
  sessions: Record<string, SessionUsage>
  tokensByModel: Record<string, ModelTokens>
  todayKey: string
  todayCostUsd: number
  rateLimit: RateLimitInfo | null

  recordResult: (
    sessionId: string,
    costUsd: number,
    durationMs: number,
    modelUsage?: Record<string, RawModelUsage>
  ) => void
  setRateLimit: (info: RateLimitInfo | null) => void
  getSession: (sessionId: string) => SessionUsage | undefined
}

interface RawModelUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

function dateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function emptyTokens(): ModelTokens {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
}

function addTokens(a: ModelTokens, b: ModelTokens): ModelTokens {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheCreation: a.cacheCreation + b.cacheCreation
  }
}

function fromRaw(raw: RawModelUsage): ModelTokens {
  return {
    input: raw.inputTokens ?? 0,
    output: raw.outputTokens ?? 0,
    cacheRead: raw.cacheReadInputTokens ?? 0,
    cacheCreation: raw.cacheCreationInputTokens ?? 0
  }
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      sessions: {},
      tokensByModel: {},
      todayKey: dateKey(),
      todayCostUsd: 0,
      rateLimit: null,

      recordResult: (sessionId, costUsd, durationMs, modelUsage) => {
        set((s) => {
          const today = dateKey()
          const rollover = today !== s.todayKey
          const safeCost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0

          const prev = s.sessions[sessionId] ?? {
            costUsd: 0,
            durationMs: 0,
            turns: 0,
            tokensByModel: {}
          }
          const sessionTokens: Record<string, ModelTokens> = { ...prev.tokensByModel }
          const globalTokens: Record<string, ModelTokens> = rollover
            ? {}
            : { ...s.tokensByModel }

          if (modelUsage) {
            for (const [model, raw] of Object.entries(modelUsage)) {
              const delta = fromRaw(raw)
              sessionTokens[model] = addTokens(sessionTokens[model] ?? emptyTokens(), delta)
              globalTokens[model] = addTokens(globalTokens[model] ?? emptyTokens(), delta)
            }
          }

          return {
            sessions: {
              ...s.sessions,
              [sessionId]: {
                costUsd: prev.costUsd + safeCost,
                durationMs: prev.durationMs + (durationMs ?? 0),
                turns: prev.turns + 1,
                tokensByModel: sessionTokens
              }
            },
            tokensByModel: globalTokens,
            todayKey: today,
            todayCostUsd: rollover ? safeCost : s.todayCostUsd + safeCost
          }
        })
      },

      setRateLimit: (info) => set({ rateLimit: info }),

      getSession: (sessionId) => get().sessions[sessionId]
    }),
    {
      name: 'command-center.usage',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        sessions: state.sessions,
        tokensByModel: state.tokensByModel,
        todayKey: state.todayKey,
        todayCostUsd: state.todayCostUsd
        // rateLimit is volatile; don't persist
      })
    }
  )
)

export function totalTokens(t: ModelTokens): number {
  return t.input + t.output + t.cacheRead + t.cacheCreation
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

export function formatResetTime(unixSeconds: number): string {
  const ms = unixSeconds * 1000
  const diff = ms - Date.now()
  if (diff <= 0) return 'now'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
