import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ManagedApp, ManagedAppInput } from '../../shared/types'
import { appsFile } from '../util/paths'

const PS = 'powershell.exe'
const psFile = (script: string): string[] => [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  script
]

// Seeded on first run from the projects already on this machine. Editable via the UI / apps.json.
const DEFAULTS: ManagedAppInput[] = [
  {
    name: 'Voice assistant',
    cwd: 'c:\\projects\\personal\\voice-assistant',
    command: PS,
    args: psFile('start-assistant.ps1'),
    ports: [8080, 8765, 5173],
    updateCommand: 'git pull'
  },
  {
    name: 'Permission gateway',
    cwd: 'c:\\projects\\personal\\github-autonomous-flow',
    command: PS,
    args: psFile('start.ps1'),
    ports: [8770]
  },
  {
    name: 'Mealplanner',
    cwd: 'c:\\projects\\personal\\Mealplanner-2.0',
    command: PS,
    args: psFile('start_app.ps1'),
    ports: [],
    updateCommand: 'git pull'
  },
  {
    name: 'Darkfall companion',
    cwd: 'c:\\projects\\personal\\darkfall-companion',
    command: PS,
    args: psFile('start_app.ps1'),
    ports: [],
    updateCommand: 'git pull'
  }
]

function isApp(x: unknown): x is ManagedApp {
  if (!x || typeof x !== 'object') return false
  const a = x as Record<string, unknown>
  return (
    typeof a.id === 'string' &&
    typeof a.name === 'string' &&
    typeof a.cwd === 'string' &&
    typeof a.command === 'string' &&
    Array.isArray(a.args) &&
    Array.isArray(a.ports)
  )
}

async function writeAll(apps: ManagedApp[]): Promise<void> {
  const file = appsFile()
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(apps, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

async function readAll(): Promise<ManagedApp[]> {
  try {
    const raw = await fs.readFile(appsFile(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isApp) : []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const seeded = DEFAULTS.map((d) => ({ ...d, id: randomUUID() }))
      await writeAll(seeded)
      return seeded
    }
    throw err
  }
}

export async function list(): Promise<ManagedApp[]> {
  return readAll()
}

export async function add(input: ManagedAppInput): Promise<ManagedApp> {
  const apps = await readAll()
  const app: ManagedApp = { ...input, id: randomUUID() }
  await writeAll([...apps, app])
  return app
}

export async function remove(id: string): Promise<void> {
  const apps = await readAll()
  await writeAll(apps.filter((a) => a.id !== id))
}
