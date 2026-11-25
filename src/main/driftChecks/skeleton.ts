import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { readFindingsRun, type SkeletonResult } from '../../shared/findings'

const RUN_ID = /^[A-Za-z0-9_-]{1,80}$/

const isSkeleton = (steps: number, findings: number, done: boolean): boolean => steps === 0 && findings === 0 && !done

/** A skeleton is a valid run with no steps or findings, named so its file stays inside the folder. */
export async function writeSkeleton(folder: string, skeleton: unknown): Promise<SkeletonResult> {
  const { run, writing, note } = readFindingsRun(JSON.stringify(skeleton ?? null), null)
  if (!run || writing || note) return { ok: false, error: note ?? 'not a valid run' }
  if (!RUN_ID.test(run.runId)) return { ok: false, error: `run id ${run.runId} is not a plain name` }
  if (!isSkeleton(run.steps.length, run.findings.length, run.done)) return { ok: false, error: 'a skeleton has no steps or findings and is not done' }
  const file = join(folder, `${run.runId}.json`)
  try {
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(file, JSON.stringify(run, null, 2), { flag: 'wx' })
    return { ok: true, file }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Removes a run file whose session never started: only a file in the folder that is still a bare skeleton. */
export async function discardSkeleton(folder: string, file: unknown): Promise<void> {
  if (typeof file !== 'string' || resolve(dirname(file)).toLowerCase() !== resolve(folder).toLowerCase()) return
  if (!RUN_ID.test(basename(file, '.json')) || !file.endsWith('.json')) return
  try {
    const { run, writing, note } = readFindingsRun(await fs.readFile(file, 'utf8'), null)
    if (!run || writing || note || !isSkeleton(run.steps.length, run.findings.length, run.done)) return
    await fs.rm(file)
  } catch (err) {
    console.error('[driftChecks] could not discard a run file', err)
  }
}
