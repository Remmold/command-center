import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { followsAfterScroll } from './scrollFollow'

/**
 * Keeps a scroll box pinned to the bottom while its content grows, but only while the reader is at
 * the bottom: scrolling up to read stops it, scrolling back down starts it again. `toBottom` is the
 * extension's `scrollToBottomOnSend`.
 */
export function useFollowOutput(scrollRef: RefObject<HTMLElement>, contentRef: RefObject<HTMLElement>): { toBottom: () => void } {
  const following = useRef(true)

  const toBottom = useCallback(() => {
    const el = scrollRef.current
    following.current = true
    if (el) el.scrollTop = el.scrollHeight
  }, [scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    let previousTop = el.scrollTop
    const onScroll = (): void => {
      // A hidden pane reports zero sizes; its last real position still counts.
      if (el.clientHeight === 0) return
      following.current = followsAfterScroll({ following: following.current, previousTop, box: el })
      previousTop = el.scrollTop
    }
    const observer = new ResizeObserver(() => {
      if (following.current && el.clientHeight > 0) el.scrollTop = el.scrollHeight
    })
    el.addEventListener('scroll', onScroll, { passive: true })
    observer.observe(content)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [scrollRef, contentRef])

  return { toBottom }
}
