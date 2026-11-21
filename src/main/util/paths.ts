import { app } from 'electron'
import { join } from 'node:path'

export function userDataPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts)
}

export function projectsFile(): string {
  return userDataPath('projects.json')
}

export function appsFile(): string {
  return userDataPath('apps.json')
}
