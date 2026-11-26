import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import {
  buildStepsView,
  formatResults,
  markStep,
  parseChecklist,
  parseResults,
  resultsPathFor,
  type Mark,
  type StepsView
} from '../../shared/testSteps'
import { fileInFolder } from './reader'

const MAX_CHECKLIST_BYTES = 1024 * 1024

const NOT_FOUND: StepsView = { found: false }

/** Marks of one results file change one at a time, so two clicks in a row never undo each other. */
const writing = new Map<string, Promise<unknown>>()

async function readText(path: string): Promise<string | null> {
  return fs.readFile(path, 'utf8').catch(() => null)
}

async function readChecklist(folder: string, path: string): Promise<{ text: string; name: string } | null> {
  if (!/\.md$/i.test(path)) return null
  const file = await fileInFolder(folder, path)
  if (!file || file.size > MAX_CHECKLIST_BYTES) return null
  const text = await readText(file.path)
  return text === null ? null : { text, name: basename(path).replace(/\.md$/i, '') }
}

/** The feature's checklist with its marks; the results path is always derived, never taken from the checklist's header. */
export async function readSteps(folder: string, checklistPath: string): Promise<StepsView> {
  const checklist = await readChecklist(folder, checklistPath)
  if (!checklist) return NOT_FOUND
  return buildStepsView(checklist.name, checklist.text, await readText(resultsPathFor(checklistPath)))
}

/** Sets or clears one step's mark in the results file, which is rewritten with only the marks of the checklist's current steps. */
export function markStepOnDisk(folder: string, checklistPath: string, hash: string, mark: Mark | null, note: string): Promise<StepsView> {
  const resultsPath = resultsPathFor(checklistPath)
  const run = async (): Promise<StepsView> => {
    const checklist = await readChecklist(folder, checklistPath)
    if (!checklist) return NOT_FOUND
    const { steps } = parseChecklist(checklist.text)
    const current = parseResults((await readText(resultsPath)) ?? '')
    const marks = steps.some((s) => s.hash === hash) ? markStep(current, hash, mark, note) : current
    await fs.writeFile(resultsPath, formatResults(checklist.name, steps, marks), 'utf8')
    return buildStepsView(checklist.name, checklist.text, await readText(resultsPath))
  }
  const next = (writing.get(resultsPath) ?? Promise.resolve()).then(run, run)
  writing.set(resultsPath, next.catch(() => undefined))
  return next
}
