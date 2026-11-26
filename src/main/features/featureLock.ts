/** Runs work on one feature at a time, so Start, Complete, Re-open and Remove never interleave their awaits. */
export function createFeatureLock() {
  const tails = new Map<string, Promise<unknown>>()
  return {
    run<T>(name: string, work: () => Promise<T>): Promise<T> {
      const result = (tails.get(name) ?? Promise.resolve()).then(work, work)
      const tail = result.catch(() => undefined)
      tails.set(name, tail)
      void tail.then(() => {
        if (tails.get(name) === tail) tails.delete(name)
      })
      return result
    }
  }
}

export type FeatureLock = ReturnType<typeof createFeatureLock>
