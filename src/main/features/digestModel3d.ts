import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { parseModel3dStats, type Model3dOutput, type Model3dView } from '../../shared/model3d'
import { model3dJobRows, type Model3dJobRow } from '../../shared/model3dJobs'
import type { DigestModel3d, DigestModel3dJob, DigestModel3dModel } from './digest'

export const MODEL3D_DIGEST_MODELS = 10

export interface DigestModel3dInput {
  view: Model3dView
  /** Main knows a feature session's title: it is the feature's name. */
  features: readonly { sessionId: string; name: string }[]
  /** Every session the app hosts, by pane id; one that is not a feature's is named by its folder. */
  hosted: readonly { paneId: string; cwd: string }[]
  workspaces: readonly { name: string; path: string }[]
}

const isOpen = (row: Model3dJobRow): boolean => row.state === 'queued' || row.state === 'running'

/** Never the progress: the digest is rewritten whenever its text changes, and progress moves every few seconds. */
function stateOf(row: Model3dJobRow): string {
  if (row.state === 'queued') return row.waitReason ?? row.stateLabel
  return row.kind === 'editor' ? 'Held' : row.stateLabel
}

async function trisOf(output: Model3dOutput): Promise<number | null> {
  const file = output.json ?? join(dirname(output.glb), `${basename(output.glb, extname(output.glb))}.json`)
  try {
    return parseModel3dStats(JSON.parse(await fs.readFile(file, 'utf8'))).tris
  } catch {
    return null
  }
}

/** The `# 3D models` facts: the queued and running jobs, and the last finished models with the tris their `.json` gives. */
export async function digestModel3d({ view, features, hosted, workspaces }: DigestModel3dInput): Promise<DigestModel3d> {
  const named = new Set(features.map((f) => f.sessionId))
  const sessions = [
    ...features.map((f) => ({ paneId: f.sessionId, title: f.name })),
    ...hosted.filter((h) => !named.has(h.paneId)).map((h) => ({ paneId: h.paneId, title: `A session in ${basename(h.cwd) || h.cwd}` }))
  ]
  const rows = model3dJobRows({ view, sessions, workspaces, profiles: [] })
  const jobs: DigestModel3dJob[] = rows
    .filter(isOpen)
    .reverse()
    .map((row) => ({ summary: row.summary, session: row.session, state: stateOf(row) }))
  const finished = rows
    .filter((row) => !isOpen(row) && row.kind === 'generate')
    .sort((a, b) => (b.to ?? 0) - (a.to ?? 0))
    .flatMap((row) => row.outputs.map((output) => ({ row, output })))
    .slice(0, MODEL3D_DIGEST_MODELS)
  const models: DigestModel3dModel[] = await Promise.all(
    finished.map(async ({ row, output }) => ({
      name: basename(output.glb, extname(output.glb)),
      glb: output.glb,
      session: row.session,
      workspace: row.workspace,
      tris: await trisOf(output),
      finishedAt: row.to
    }))
  )
  return { jobs, models }
}
