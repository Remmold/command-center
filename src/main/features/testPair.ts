import { namedPorts, type FeatureRecord } from '../../shared/features'
import type { FeatureServersView } from '../../shared/featureServers'
import type { PreviewConfig } from '../../shared/previewConfig'
import type { TestFlowFocus } from '../../shared/testFlow'
import { previewStartUrl } from './previewNavigation'
import type { StartResult } from './serverRunner'

/** What the pair's windows need: the test flow, and the preview browser's first page and ports; none without a preview. */
export interface PairSpec {
  feature: string
  flow: TestFlowFocus
  preview: { url: string; ports: number[] } | null
}

export interface TestPairDeps {
  feature: (name: string) => Promise<FeatureRecord | undefined>
  config: (feature: FeatureRecord) => Promise<PreviewConfig | null>
  runner: { start: (name: string) => Promise<StartResult>; settled: (name: string) => Promise<FeatureServersView> }
  flowFocus: (feature: FeatureRecord) => Promise<TestFlowFocus>
  /** Opens the pair, or brings an open one to the front; never a second. */
  open: (spec: PairSpec) => void
}

export type TestResult = { ok: true } | { ok: false; error: string }

/**
 * The Test button: boots the feature's servers and opens its pair once every one is Ready. A workspace without preview
 * servers opens only the test flow window. A Failed server opens nothing; its output and Retry are on the feature's row.
 */
export async function testFeature(deps: TestPairDeps, name: string): Promise<TestResult> {
  const feature = await deps.feature(name)
  if (!feature) return { ok: false, error: `The feature ${name} is not known.` }
  if (feature.completedAt !== null) return { ok: false, error: `${name} is completed; re-open it before testing.` }
  const flow = await deps.flowFocus(feature)
  const config = await deps.config(feature)
  if (!config || config.servers.length === 0) {
    deps.open({ feature: name, flow, preview: null })
    return { ok: true }
  }
  const started = await deps.runner.start(name)
  if (!started.ok) return started
  const view = await deps.runner.settled(name)
  const notReady = config.servers.filter((s) => view.servers.find((v) => v.name === s.name)?.status !== 'ready')
  if (notReady.length > 0) {
    const failed = view.servers.filter((v) => v.status === 'failed')
    return {
      ok: false,
      error:
        failed.length > 0
          ? `${failed.map((v) => v.name).join(', ')} failed to start; its output and Retry are on the feature row.`
          : 'The servers were stopped before they were ready.'
    }
  }
  const ports = namedPorts((await deps.feature(name)) ?? feature, config.servers.map((s) => s.name))
  const own = config.servers.map((s) => ports.get(s.name)).filter((p): p is number => p !== undefined)
  deps.open({ feature: name, flow, preview: { url: previewStartUrl(own[0], config.startPage), ports: own } })
  return { ok: true }
}
