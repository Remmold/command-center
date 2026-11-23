import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function media(): MediaQueryList | undefined {
  return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : undefined
}

/** Follows the system's reduce-motion setting, as the extension's `pRe`. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => media()?.matches ?? false)
  useEffect(() => {
    const query = media()
    if (!query) return
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches)
    query.addEventListener('change', onChange)
    setReduced(query.matches)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}
