export type ServerStatus = 'starting' | 'ready' | 'failed' | 'stopped'

/** One of a feature's servers as the runner knows it. */
export interface FeatureServerView {
  name: string
  port: number
  status: ServerStatus
  /** The terminal in the Processes view that holds its output and Stop. */
  terminalId: string
  /** Why it is Failed, in plain words. */
  reason?: string
  /** The end of its output, only while Failed. */
  output?: string
}

/** A feature's servers; empty before they were ever started. */
export interface FeatureServersView {
  servers: FeatureServerView[]
}

export type ServersSummary = 'none' | 'starting' | 'ready' | 'failed' | 'stopped'

/** The row's one word: any Failed wins, then any Starting, then all Ready; all stopped is Stopped. */
export function serversSummary(servers: readonly Pick<FeatureServerView, 'status'>[]): ServersSummary {
  if (servers.length === 0) return 'none'
  if (servers.some((s) => s.status === 'failed')) return 'failed'
  if (servers.some((s) => s.status === 'starting')) return 'starting'
  if (servers.every((s) => s.status === 'ready')) return 'ready'
  return 'stopped'
}

const NOTE: Record<ServersSummary, string> = { none: '', starting: 'Starting', ready: 'Ready', failed: 'Failed', stopped: 'Stopped' }

/** The label on a feature row; empty until servers were started. */
export function serversNote(servers: readonly Pick<FeatureServerView, 'status'>[]): string {
  return NOTE[serversSummary(servers)]
}

/** Whether Stop servers has anything to stop. */
export function serversRunning(servers: readonly Pick<FeatureServerView, 'status'>[]): boolean {
  return servers.some((s) => s.status === 'starting' || s.status === 'ready')
}
