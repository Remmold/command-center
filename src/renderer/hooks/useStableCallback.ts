import { useCallback, useLayoutEffect, useRef } from 'react'

/** A function that keeps one identity for the component's life and always calls the latest `fn`; for event handlers, not for render. */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn)
  useLayoutEffect(() => {
    latest.current = fn
  })
  return useCallback((...args: A) => latest.current(...args), [])
}
