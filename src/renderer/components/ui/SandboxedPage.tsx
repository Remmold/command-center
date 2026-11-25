import { useEffect, useRef } from 'react'
import { PAGE_SCROLL_MESSAGE, pageScrollOf } from '../../../shared/pageScroll'

interface Props {
  url: string
  title: string
  /** Where to scroll the page once it has loaded, sent as a `PAGE_SCROLL_MESSAGE`; a page that does not listen ignores it. */
  scrollY?: number
  /** Called with the scroll place a page reports in `PAGE_SCROLL_MESSAGE`s. */
  onScroll?: (y: number) => void
}

/**
 * A page from one of the app's read-only schemes in a frame that may run its own script but gets an opaque origin:
 * no access to the app, no popups, no top-level navigation. The scheme's policy keeps it off the network.
 */
export function SandboxedPage({ url, title, scrollY, onScroll }: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    if (!onScroll) return
    const listen = (event: MessageEvent): void => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return
      const y = pageScrollOf(event.data)
      if (y !== null) onScroll(y)
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [onScroll])

  // The frame's origin is opaque, so no narrower target reaches it.
  const restore = (): void => {
    if (scrollY) frameRef.current?.contentWindow?.postMessage({ type: PAGE_SCROLL_MESSAGE, y: scrollY }, '*')
  }

  return (
    <iframe
      ref={frameRef}
      src={url}
      title={title}
      sandbox="allow-scripts"
      allow="clipboard-write"
      referrerPolicy="no-referrer"
      onLoad={restore}
      className="h-full w-full flex-1 border-0 bg-editor"
    />
  )
}
