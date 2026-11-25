import type { ShownFinding } from './findings'

function healthEntry(f: ShownFinding): string {
  return [`- ${f.id} on ${f.path}`, `  Claim: ${f.claim}`, `  Evidence: ${f.evidence}`, `  Fix: ${f.fix}`].join('\n')
}

/**
 * The one message "Apply N fixes" sends: each drift run's findings file with its ticked ids, and ticked health findings
 * in full, because they are in no file. `runFiles` holds each shown run's file by run id.
 */
export function fixMessage(ticked: readonly ShownFinding[], runFiles: Readonly<Record<string, string>>): string {
  const byFile = new Map<string, string[]>()
  const health: ShownFinding[] = []
  for (const f of ticked) {
    const file = f.runId === undefined ? undefined : runFiles[f.runId]
    if (file === undefined) health.push(f)
    else byFile.set(file, [...(byFile.get(file) ?? []), f.id])
  }
  const parts = ['Fix findings: apply only the findings below, nothing else.']
  if (byFile.size > 0) {
    parts.push(
      'Each one is in its findings file. Once you have applied or skipped one, set its "status" to "applied" or "skipped" in that file, rewriting the whole file as valid JSON.',
      ...[...byFile].map(([file, ids]) => `Findings file: ${file}\nIds: ${ids.join(', ')}`)
    )
  }
  if (health.length > 0) {
    parts.push(['Health-check findings (in no file; say which you applied and which you skipped):', ...health.map(healthEntry)].join('\n'))
  }
  return parts.join('\n\n')
}
