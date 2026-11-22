import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { restoredScrollTop, type SavedScroll } from '../../state/restoreSnapshot'
import { followsAfterScroll } from './scrollFollow'

interface Restore {
  /** Where the box was when the app last closed; it reopens there. */
  saved?: SavedScroll
  onScrolled?: (scroll: SavedScroll) => void
}

/**
 * Keeps a scroll box pinned to the bottom while its content grows, but only while the reader is at
 * the bottom: scrolling up to read stops it, scrolling back down starts it again. `toBottom` is the
 * extension's `scrollToBottomOnSend`.
 */
export function useFollowOutput(scrollRef: RefObject<HTMLElement>, contentRef: RefObject<HTMLElement>, restore: Restore = {}): { toBottom: () => void } {
  const following = useRef(restore.saved?.following ?? true)
  const pending = useRef(restore.saved && !restore.saved.following ? restore.saved : undefined)
  const scrolledRef = useRef(restore.onScrolled)
  scrolledRef.current = restore.onScrolled

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
    // Lazily rendered messages only have an estimated height; render them all once so the saved place is exact.
    if (pending.current) content.dataset.restoring = ''
    const onScroll = (): void => {
      // A hidden pane reports zero sizes; its last real position still counts.
      if (el.clientHeight === 0 || pending.current) return
      following.current = followsAfterScroll({ following: following.current, previousTop, box: el })
      previousTop = el.scrollTop
      scrolledRef.current?.({ top: el.scrollTop, following: following.current })
    }
    const observer = new ResizeObserver(() => {
      if (el.clientHeight === 0) return
      if (pending.current) {
        el.scrollTop = restoredScrollTop(pending.current, el)
        previousTop = el.scrollTop
        pending.current = undefined
        delete content.dataset.restoring
        return
      }
      if (following.current) el.scrollTop = el.scrollHeight
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
