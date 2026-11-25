import { promises as fs } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { DEFAULT_TEST_FLOWS_FOLDER } from '../../shared/testFlow'
import { userDataPath } from '../util/paths'

function settingsFile(): string {
  return userDataPath('test-flow-settings.json')
}

let cached: string | null = null

export async function readTestFlowsFolder(): Promise<string> {
  if (cached !== null) return cached
  try {
    const folder = (JSON.parse(await fs.readFile(settingsFile(), 'utf-8')) as { folder?: unknown } | null)?.folder
    cached = typeof folder === 'string' && isAbsolute(folder) ? folder : DEFAULT_TEST_FLOWS_FOLDER
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err
    cached = DEFAULT_TEST_FLOWS_FOLDER
  }
  return cached
}

/** Saves an absolute folder and returns the folder in force, which is the old one when `folder` is not absolute. */
export async function writeTestFlowsFolder(folder: string): Promise<string> {
  const clean = folder.trim()
  if (!isAbsolute(clean)) return readTestFlowsFolder()
  const file = settingsFile()
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify({ folder: clean }, null, 2), 'utf-8')
  await fs.rename(tmp, file)
  cached = clean
  return clean
}
