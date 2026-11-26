export type PreviewNavigation = 'allow' | 'external' | 'deny'

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1'])
const NETWORK_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:', 'ws:', 'wss:'])
const DEFAULT_PORT: Record<string, number> = { 'http:': 80, 'https:': 443, 'ws:': 80, 'wss:': 443 }

/**
 * What the preview browser does with an address: load it (localhost on one of the feature's own ports), hand it to the
 * default browser (any other http or https address), or refuse it (any other scheme, or an address that does not parse).
 */
export function previewNavigation(url: string, ports: readonly number[]): PreviewNavigation {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'deny'
  }
  if (!NETWORK_SCHEMES.has(parsed.protocol)) return 'deny'
  const port = parsed.port === '' ? DEFAULT_PORT[parsed.protocol] : Number(parsed.port)
  if (LOCAL_HOSTS.has(parsed.hostname) && ports.includes(port)) return 'allow'
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? 'external' : 'deny'
}

/** Whether a request the page makes may leave the app: everything but the network is the page's own, the network only to the feature's ports. */
export function previewRequestAllowed(url: string, ports: readonly number[]): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return !NETWORK_SCHEMES.has(parsed.protocol) || previewNavigation(url, ports) === 'allow'
}

/** Where the preview browser opens: the first server's port and the config's start page. */
export function previewStartUrl(port: number, startPage: string): string {
  return `http://localhost:${port}${startPage.startsWith('/') ? startPage : `/${startPage}`}`
}

/** The partition a feature's preview browser keeps its cookies and storage in. */
export const previewPartition = (feature: string): string => `persist:feature-${feature}`

/** Lets one call through per `intervalMs`; the page cannot flood the default browser with windows. */
export function createRateGate(intervalMs: number, now: () => number = Date.now): () => boolean {
  let last = -Infinity
  return () => {
    const at = now()
    if (at - last < intervalMs) return false
    last = at
    return true
  }
}
