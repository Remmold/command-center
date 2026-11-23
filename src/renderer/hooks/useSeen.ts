import { useEffect, useState } from 'react'

/** True once the element has scrolled into view; it stays loaded after. */
export function useSeen(): [(el: HTMLElement | null) => void, boolean] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!el || seen) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, seen])
  return [setEl, seen]
}
