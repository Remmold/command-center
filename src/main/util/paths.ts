import { app } from 'electron'
import { join } from 'node:path'
import { digestFileName } from '../features/digest'

export function userDataPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts)
}

/** The feature digest the main chat reads (ticket 10 gives this path to it). */
export function featureDigestFile(): string {
  return userDataPath(digestFileName)
}

/** The fixed folder the main chat runs in. */
export function mainChatDir(): string {
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

/** Packaging must ship resources/icons as the extra resource "icons". */
export function iconPath(file: string): string {
  if (app.isPackaged) return join(process.resourcesPath, 'icons', file)
  return join(app.getAppPath(), 'resources', 'icons', file)
}
