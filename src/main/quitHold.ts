export interface QuittingApp {
  on(event: 'before-quit', listener: (event: { preventDefault(): void }) => void): void
  quit(): void
}

/** Holds the first quit until `end` settles or `limitMs` passes, then quits again; quits in between stay held. */
export function holdQuit(app: QuittingApp, end: () => Promise<void>, limitMs: number): void {
  let phase: 'open' | 'ending' | 'ended' = 'open'
  app.on('before-quit', (event) => {
    if (phase === 'ended') return
    event.preventDefault()
    if (phase === 'ending') return
    phase = 'ending'
    let timer: ReturnType<typeof setTimeout> | undefined
    const limit = new Promise<void>((resolve) => (timer = setTimeout(resolve, limitMs)))
    const ended = new Promise<void>((resolve) => resolve(end())).catch(() => undefined)
    void Promise.race([ended, limit]).then(() => {
      clearTimeout(timer)
      phase = 'ended'
      app.quit()
    })
  })
}
