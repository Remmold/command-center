import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import type { Model3dOutput, Model3dProgress, Model3dStage } from '../../shared/model3d'

const MARKER = '@@model3d '
const STAGES: readonly Model3dStage[] = ['picture', 'mask', 'generate', 'render']

const intOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)

/** The item and stage in a worker's `@@model3d {…}` stderr marker; null for any other line. A new stage starts without a sampling step. */
export function progressMarker(line: string): Model3dProgress | null {
  const at = line.indexOf(MARKER)
  if (at < 0) return null
  let data: unknown
  try {
    data = JSON.parse(line.slice(at + MARKER.length))
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  return {
    item: intOrNull(d.item),
    of: intOrNull(d.of),
    name: typeof d.name === 'string' ? d.name : null,
    stage: STAGES.includes(d.stage as Model3dStage) ? (d.stage as Model3dStage) : null,
    step: null,
    steps: null
  }
}

const exists = (file: string): Promise<boolean> => fs.stat(file).then((s) => s.isFile(), () => false)

/** The models a worker printed on stdout: each `.glb` line, the `_sheet.png` line after it, and the `.json` beside the GLB when it is there. */
export async function workerOutputs(stdout: readonly string[], cwd: string): Promise<Model3dOutput[]> {
  const outputs: Model3dOutput[] = []
  for (const raw of stdout) {
    const line = raw.trim()
    if (!line) continue
    const lower = line.toLowerCase()
    if (lower.endsWith('.glb')) {
      const glb = resolve(cwd, line)
      const json = glb.replace(/\.glb$/i, '.json')
      outputs.push((await exists(json)) ? { glb, json } : { glb })
    } else if (lower.endsWith('_sheet.png')) {
      const last = outputs.at(-1)
      if (last && !last.sheet) last.sheet = resolve(cwd, line)
    }
  }
  return outputs
}

/** The pictures a prompt job printed on stdout for approval: each `_input.png` line. */
export function workerPictures(stdout: readonly string[], cwd: string): string[] {
  return stdout.map((l) => l.trim()).filter((l) => l.toLowerCase().endsWith('_input.png')).map((l) => resolve(cwd, l))
}

/** `<name>: <why>` from gen3d.py's `FAILED` line for each batch item it could not make, in order. */
export function failedItems(stderr: readonly string[]): string[] {
  return stderr.map((l) => /^\s*FAILED\s+(.+)$/.exec(l)?.[1]?.trim()).filter((l): l is string => !!l)
}

/** The last `FAILED` or error line the worker gave, else its last line. */
export function workerError(stderr: readonly string[]): string | null {
  const lines = stderr.map((l) => l.trim()).filter((l) => l && !l.includes(MARKER))
  for (let i = lines.length - 1; i >= 0; i--) if (/FAILED|error/i.test(lines[i])) return lines[i]
  return lines.at(-1) ?? null
}
