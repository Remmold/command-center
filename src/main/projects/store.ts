import { promises as fs } from 'node:fs'
import { basename, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Project } from '../../shared/types'
import { projectsFile } from '../util/paths'

function isProject(x: unknown): x is Project {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.path === 'string' &&
    typeof p.createdAt === 'number'
  )
}

async function readAll(): Promise<Project[]> {
  try {
    const raw = await fs.readFile(projectsFile(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isProject)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function writeAll(projects: Project[]): Promise<void> {
  const file = projectsFile()
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(projects, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

export async function list(): Promise<Project[]> {
  return readAll()
}

export async function add(path: string): Promise<Project> {
  const projects = await readAll()
  const existing = projects.find((p) => p.path === path)
  if (existing) return existing
  const project: Project = {
    id: randomUUID(),
    name: basename(path) || path,
    path,
    createdAt: Date.now()
  }
  await writeAll([...projects, project])
  return project
}

export async function remove(id: string): Promise<void> {
  const projects = await readAll()
  await writeAll(projects.filter((p) => p.id !== id))
}
