/** What the CLI's `get_task_output` returns for a background process. */
export interface TaskOutput {
  output: string
  /** Bytes the process has written in all, which can exceed `output` once it is cut. */
  totalBytes: number
  /** `output` is only the end of what the process wrote. */
  truncated: boolean
}

export type OutputStep = { kind: 'none' } | { kind: 'append'; text: string } | { kind: 'rewrite'; text: string }

export function taskOutputOf(response: Record<string, unknown>): TaskOutput | undefined {
  const { output, total_bytes, truncated } = response
  if (typeof output !== 'string') return undefined
  return { output, totalBytes: typeof total_bytes === 'number' ? total_bytes : new TextEncoder().encode(output).length, truncated: truncated === true }
}

/** The length of the longest start of `next` that `written` ends with (a prefix function over `next`, then `written`'s end). */
function overlap(written: string, next: string): number {
  const text = `${next}\u0000${written.slice(-next.length)}`
  const prefix = new Array<number>(text.length).fill(0)
  for (let i = 1; i < text.length; i++) {
    let k = prefix[i - 1]
    while (k > 0 && text[i] !== text[k]) k = prefix[k - 1]
    if (text[i] === text[k]) k++
    prefix[i] = k
  }
  return prefix[text.length - 1] ?? 0
}

/** How a terminal showing `written` catches up with `next`: write the added bytes, or clear and rewrite when nothing of it is still there. */
export function outputStep(written: TaskOutput | null, next: TaskOutput): OutputStep {
  if (written === null) return { kind: 'append', text: next.output }
  if (next.totalBytes === written.totalBytes && (next.truncated || next.output === written.output)) return { kind: 'none' }
  if (next.output.startsWith(written.output)) return { kind: 'append', text: next.output.slice(written.output.length) }
  // A cut output starts later each poll: what it shares with the end of what was written stays, the rest is new.
  const shared = overlap(written.output, next.output)
  if (shared > 0) return { kind: 'append', text: next.output.slice(shared) }
  return { kind: 'rewrite', text: next.output }
}
