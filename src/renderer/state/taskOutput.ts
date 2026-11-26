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

/** How a terminal showing `written` catches up with `next`: write the added bytes, or clear and rewrite. */
export function outputStep(written: TaskOutput | null, next: TaskOutput): OutputStep {
  if (written === null) return { kind: 'append', text: next.output }
  if (next.totalBytes === written.totalBytes && (next.truncated || next.output === written.output)) return { kind: 'none' }
  if (!next.truncated && next.output.startsWith(written.output)) return { kind: 'append', text: next.output.slice(written.output.length) }
  return { kind: 'rewrite', text: next.output }
}
