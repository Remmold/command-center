export interface LocalServer {
  port: number
  /** Scheme, host and port only; `0.0.0.0` and `[::1]` become `localhost`. */
  url: string
}

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const LOCAL_URL = /\b(https?):\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{1,5})(?!\d)/gi
const OPENS_AS_LOCALHOST = new Set(['0.0.0.0', '[::1]'])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

function withoutAnsi(text: string): string {
  return text.replace(ANSI, '')
}

/** The local servers a process's output names, one per port, in the order first seen. */
export function localServers(output: string): LocalServer[] {
  const found = new Map<number, LocalServer>()
  for (const [, scheme, host, digits] of withoutAnsi(output).matchAll(LOCAL_URL)) {
    const port = Number(digits)
    if (port < 1 || port > 65535 || found.has(port)) continue
    const lower = host.toLowerCase()
    found.set(port, { port, url: `${scheme.toLowerCase()}://${OPENS_AS_LOCALHOST.has(lower) ? 'localhost' : lower}:${port}` })
  }
  return [...found.values()]
}

/** Only these may be opened from a process's output. */
export function isLocalUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const { protocol, hostname, username, password } = parsed
  return (protocol === 'http:' || protocol === 'https:') && LOCAL_HOSTS.has(hostname) && username === '' && password === ''
}

/** The last `count` lines of a process's output, terminal colours removed. */
export function outputTail(output: string, count: number): string {
  const lines = withoutAnsi(output).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  return lines.slice(-count).join('\n')
}
