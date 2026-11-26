/** One server a feature's preview boots, run in a folder of the feature worktree. */
export interface PreviewServer {
  name: string
  /** May hold `{port}`, which becomes the server's reserved port; the server also gets PORT. */
  command: string
  /** Relative to the worktree root, never outside it. */
  cwd: string
  /** The only ready check: the server's port accepts a connection. */
  ready: 'port'
}

/** A workspace's saved preview config. A workspace with no servers has no browser, only the test flow. */
export interface PreviewConfig {
  /** Run in the new worktree before the feature session starts; empty means none. */
  install: string
  servers: PreviewServer[]
  /** A path on the first server, starting with `/`. */
  startPage: string
}

export type PreviewConfigRead = { ok: true; config: PreviewConfig } | { ok: false; error: string }

const bad = (error: string): PreviewConfigRead => ({ ok: false, error })
const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

function cwdProblem(cwd: string): boolean {
  return /^([a-zA-Z]:|[\\/])/.test(cwd) || cwd.split(/[\\/]/).includes('..')
}

/** Validates a saved or edited config, trims its text and fills defaults; a refusal names the field and its server's number. */
export function readPreviewConfig(raw: unknown): PreviewConfigRead {
  if (!isObject(raw)) return bad('The preview config is not an object.')
  if (raw.install !== undefined && typeof raw.install !== 'string') return bad('install must be text.')
  if (raw.servers !== undefined && !Array.isArray(raw.servers)) return bad('servers must be a list.')
  if (raw.startPage !== undefined && typeof raw.startPage !== 'string') return bad('startPage must be text.')
  const startPage = typeof raw.startPage === 'string' && raw.startPage.trim() !== '' ? raw.startPage.trim() : '/'
  if (!startPage.startsWith('/') || startPage.startsWith('//')) return bad('startPage must be a path on the server, starting with /.')

  const servers: PreviewServer[] = []
  const entries: unknown[] = Array.isArray(raw.servers) ? raw.servers : []
  for (const [i, entry] of entries.entries()) {
    const at = `servers[${i + 1}]`
    if (!isObject(entry)) return bad(`${at} is not an object.`)
    const text = (key: string): string | undefined => (typeof entry[key] === 'string' ? (entry[key] as string).trim() : undefined)
    const name = text('name')
    if (!name) return bad(`${at}.name is required.`)
    if (servers.some((s) => s.name === name)) return bad(`${at}.name "${name}" is used by another server.`)
    const command = text('command')
    if (!command) return bad(`${at}.command is required (${name}).`)
    const cwd = text('cwd') || '.'
    if (cwdProblem(cwd)) return bad(`${at}.cwd must be a folder inside the worktree (${name}).`)
    if (entry.ready !== undefined && entry.ready !== 'port') return bad(`${at}.ready must be "port" (${name}).`)
    servers.push({ name, command, cwd, ready: 'port' })
  }
  return { ok: true, config: { install: typeof raw.install === 'string' ? raw.install.trim() : '', servers, startPage } }
}

/** The command a server runs once its port is known. */
export function serverCommand(command: string, port: number): string {
  return command.split('{port}').join(String(port))
}

/** A config that says nothing: saving it removes the workspace's config. */
export function isEmptyPreviewConfig(config: PreviewConfig): boolean {
  return config.install === '' && config.servers.length === 0
}
