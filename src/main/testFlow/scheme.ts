import { protocol } from 'electron'
import { TEST_FLOW_SCHEME } from '../../shared/testFlow'
import { serveTestFlow } from './reader'
import { readTestFlowsFolder } from './settings'

export const TEST_FLOW_SCHEME_PRIVILEGES = { scheme: TEST_FLOW_SCHEME, privileges: { standard: true, secure: true } }

export function handleTestFlowScheme(): void {
  protocol.handle(TEST_FLOW_SCHEME, async (request) => serveTestFlow(await readTestFlowsFolder(), request.url))
}

/** A frame may only navigate within the scheme, so a link in a test flow cannot load a web page inside the app. */
export function allowedFrameNavigation(url: string, isMainFrame: boolean): boolean {
  return isMainFrame || url.startsWith(`${TEST_FLOW_SCHEME}:`) || url === 'about:blank' || url === 'about:srcdoc'
}
