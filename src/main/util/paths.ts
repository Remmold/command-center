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

/** Packaging must ship resources/icons as the extra resource "icons". */
export function iconPath(file: string): string {
  if (app.isPackaged) return join(process.resourcesPath, 'icons', file)
  return join(app.getAppPath(), 'resources', 'icons', file)
}
