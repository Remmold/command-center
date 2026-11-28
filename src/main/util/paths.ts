import { app } from 'electron'
import { join } from 'node:path'

export function userDataPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts)
}

/** The folder the retired main chat ran in; only its leftover workspace record is looked for. */
export function retiredMainChatDir(): string {
  return userDataPath('main-chat')
}

export function projectsFile(): string {
  return userDataPath('projects.json')
}

export function appsFile(): string {
  return userDataPath('apps.json')
}

/** Where drift checks write their run files, one JSON file per run (ADR 0005). */
export function driftChecksFolder(): string {
  return userDataPath('drift-checks')
}

/** The 3D service's jobs folder (ADR 0011): requests from gen3d.py, statuses and service.json from the app. */
export function model3dJobsFolder(): string {
  return userDataPath('model3d-jobs')
}

/** Packaging must ship resources/icons as the extra resource "icons". */
export function iconPath(file: string): string {
  if (app.isPackaged) return join(process.resourcesPath, 'icons', file)
  return join(app.getAppPath(), 'resources', 'icons', file)
}
