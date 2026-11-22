/** The extension's thinking block summary (`GTt`). */
export function thinkingLabel({ streaming, durationMs }: { streaming: boolean; durationMs: number | undefined }): string {
  if (streaming) return 'Thinking...'
  if (durationMs !== undefined) return `Thought for ${Math.round(durationMs / 1000)}s`
  return 'Thinking'
}

/** The extension's live estimate after "Thinking..." (`yZe`). */
export function thinkingTokensLabel(estimate: number | undefined): string | null {
  if (estimate === undefined || estimate <= 0) return null
  return `${estimate < 1000 ? String(estimate) : `${(estimate / 1000).toFixed(1)}k`} tokens`
}
