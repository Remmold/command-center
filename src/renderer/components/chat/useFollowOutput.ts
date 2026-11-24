import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { restoredScrollTop, type SavedScroll } from '../../state/restoreSnapshot'
import { followsAfterScroll, readerLeavesBottom } from './scrollFollow'

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
  // Where the app itself last put the box, as the browser clamped it.
  const ownTop = useRef<number | undefined>(undefined)

  const toBottom = useCallback(() => {
    const el = scrollRef.current
    following.current = true
    if (!el) return
    el.scrollTop = el.scrollHeight
    ownTop.current = el.scrollTop
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
      following.current = followsAfterScroll({ following: following.current, previousTop, box: el, ownTop: ownTop.current })
      ownTop.current = undefined
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
      if (following.current) {
        el.scrollTop = el.scrollHeight
        ownTop.current = el.scrollTop
      }
    })
    // The reader's own move wins over the next re-pin, which would otherwise land before its scroll event.
    const leave = (): void => {
      following.current = false
      ownTop.current = undefined
    }
    const onWheel = (e: WheelEvent): void => {
      if (readerLeavesBottom({ kind: 'wheel', deltaY: e.deltaY })) leave()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (readerLeavesBottom({ kind: 'key', key: e.key })) leave()
    }
    // A press on the scroll box itself, outside its content, is a grab of the scrollbar.
    const onPointer = (e: PointerEvent): void => {
      if (e.target === el) leave()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('keydown', onKey)
    el.addEventListener('pointerdown', onPointer)
    observer.observe(content)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('keydown', onKey)
      el.removeEventListener('pointerdown', onPointer)
      observer.disconnect()
    }
  }, [scrollRef, contentRef])

  return { toBottom }
}
