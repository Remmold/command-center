import { useEffect, useState } from 'react'

/** Re-renders every `everyMs` (a second by default) while `on`, for a running clock; returns the time of the last tick. */
export function useTicking(on: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [on, everyMs])
  return on ? now : Date.now()
}
