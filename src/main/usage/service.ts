import { promises as fs } from 'node:fs'
import { DEFAULT_PROFILE_ID, type AccountProfile, type ProfileUsage } from '../../shared/types'
import { RefreshPlan } from './refreshPlan'
import { applyRateLimitEvent, readUsage, type RateLimitInfo } from './usageReply'
import type { ProbeReplies } from './probe'

const POLL_MS = 5 * 60_000
const RESULT_DEBOUNCE_MS = 5_000

export interface UsageServiceDeps {
  listProfiles: () => Promise<AccountProfile[]>
  /** The environment a CLI needs to run as the profile (repairs its links on the way). */
  envFor: (profileId: string) => Promise<Record<string, string>>
  probe: (cwd: string, env: Record<string, string>) => Promise<ProbeReplies>
  /** An empty folder the probe runs in, so no project's settings apply. */
  probeDir: string
  onChange: (all: ProfileUsage[]) => void
  now?: () => number
}

function blank(profileId: string, loggedIn: boolean): ProfileUsage {
  return { profileId, loggedIn, account: null, updatedAt: null, refreshing: false }
}

/** Keeps every account profile's plan limits current: polled, refreshed after turns, nudged by live events. */
export class UsageService {
  private readonly plan = new RefreshPlan({ pollMs: POLL_MS, debounceMs: RESULT_DEBOUNCE_MS })
  private readonly byProfile = new Map<string, ProfileUsage>()
  private order: string[] = []
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private readonly now: () => number

  constructor(private readonly deps: UsageServiceDeps) {
    this.now = deps.now ?? Date.now
  }

  start(): void {
    void this.tick()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  list(): ProfileUsage[] {
    return this.order.map((id) => this.byProfile.get(id)).filter((u): u is ProfileUsage => u !== undefined)
  }

  /** Refresh: one profile, or all of them. */
  refresh(profileId?: string): void {
    const now = this.now()
    for (const id of profileId ? [profileId] : this.order) this.plan.requestNow(id, now)
    void this.tick()
  }

  turnEnded(profileId: string): void {
    this.plan.noteResult(profileId, this.now())
    this.schedule()
  }

  rateLimitEvent(profileId: string, info: RateLimitInfo): void {
    const prior = this.byProfile.get(profileId)
    if (!prior) return
    this.byProfile.set(profileId, { ...applyRateLimitEvent(prior, info), updatedAt: this.now() })
    this.emit()
  }

  private async tick(): Promise<void> {
    if (this.stopped) return
    let profiles: AccountProfile[]
    try {
      profiles = await this.deps.listProfiles()
    } catch (err) {
      console.error('[usage] could not list profiles', err)
      profiles = []
    }
    this.syncProfiles(profiles)
    const now = this.now()
    for (const id of this.plan.due(now)) {
      const profile = profiles.find((p) => p.id === id)
      if (profile) void this.fetch(profile)
    }
    this.schedule()
  }

  private syncProfiles(profiles: AccountProfile[]): void {
    this.order = profiles.map((p) => p.id)
    const loggedInSince: string[] = []
    for (const id of [...this.byProfile.keys()]) if (!this.order.includes(id)) this.byProfile.delete(id)
    for (const p of profiles) {
      const prior = this.byProfile.get(p.id)
      if (!prior) this.byProfile.set(p.id, blank(p.id, p.loggedIn))
      else if (!p.loggedIn) this.byProfile.set(p.id, blank(p.id, false))
      else if (!prior.loggedIn && prior.updatedAt === null) {
        this.byProfile.set(p.id, blank(p.id, true))
        loggedInSince.push(p.id)
      }
    }
    this.plan.setProfiles(this.order, this.now())
    for (const id of loggedInSince) this.plan.requestNow(id, this.now())
  }

  private schedule(): void {
    if (this.stopped) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const at = this.plan.wakeAt()
    if (at === null) return
    this.timer = setTimeout(() => void this.tick(), Math.max(0, at - this.now()))
  }

  private async fetch(profile: AccountProfile): Promise<void> {
    this.plan.started(profile.id, this.now())
    if (!profile.loggedIn) {
      this.byProfile.set(profile.id, blank(profile.id, false))
      this.plan.finished(profile.id)
      this.emit()
      return
    }
    this.update(profile.id, { refreshing: true })
    try {
      await fs.mkdir(this.deps.probeDir, { recursive: true })
      const env = profile.id === DEFAULT_PROFILE_ID ? {} : await this.deps.envFor(profile.id)
      const { init, usage } = await this.deps.probe(this.deps.probeDir, env)
      const reading = readUsage(init, usage)
      const loggedIn = Object.keys(reading.account ?? {}).length > 0
      this.byProfile.set(profile.id, {
        profileId: profile.id,
        loggedIn,
        ...reading,
        updatedAt: this.now(),
        refreshing: false
      })
    } catch (err) {
      console.error('[usage] check failed', profile.name, (err as Error).message)
      this.update(profile.id, { refreshing: false, error: (err as Error).message })
    } finally {
      this.plan.finished(profile.id)
      this.emit()
      this.schedule()
    }
  }

  private update(profileId: string, patch: Partial<ProfileUsage>): void {
    const prior = this.byProfile.get(profileId)
    if (!prior) return
    this.byProfile.set(profileId, { ...prior, ...patch })
    this.emit()
  }

  private emit(): void {
    this.deps.onChange(this.list())
  }
}
