import { useEffect, useState } from 'react'

/** Re-renders every second while `on`, for a running clock; returns the time of the last tick. */
export function useTicking(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [on])
  return on ? now : Date.now()
}
