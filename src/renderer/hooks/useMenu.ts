import { useCallback, useState } from 'react'

/** Open state and anchor element for a popover menu. */
export function useMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const show = useCallback(() => setOpen(true), [])
  const toggle = useCallback(() => setOpen((o) => !o), [])
  return { anchor, setAnchor, open, toggle, show, close }
}
