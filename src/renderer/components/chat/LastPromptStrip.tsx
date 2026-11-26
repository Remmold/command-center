import { useEffect, useMemo, useState, type RefObject } from 'react'
import { CornerLeftUp } from 'lucide-react'
import type { ChatItem } from './types'
import type { HeldPrompt } from './heldPrompts'
import { lastPrompt } from '../../state/lastPrompt'
import { SummaryStrip } from '../ui/SummaryStrip'

/** The `prompt-flash` animation's length in index.css. */
const FLASH_MS = 1500
/** How long a smooth scroll may take before its landing is checked anyway. */
const SETTLE_MS = 1200
const FLASH_CLASS = 'prompt-flash'
const NONE_HELD: readonly HeldPrompt[] = []
const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

/** The prompt's row; chats saved before blocks were merged can repeat its id on other rows. */
function promptRow(root: HTMLElement, id: string): HTMLElement | null {
  const rows = [...root.querySelectorAll<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)]
  return rows.reverse().find((row) => row.querySelector('[data-user-prompt]')) ?? null
}

/** Whether the row sits at the top of the box, or as near as the box can scroll. */
function landed(root: HTMLElement, row: HTMLElement): boolean {
  const off = row.getBoundingClientRect().top - root.getBoundingClientRect().top
  const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 1
  return Math.abs(off) <= 2 || (off > 0 && atEnd)
}

/** Lazily rendered rows in between only have an estimated height, so the first landing can miss; one more scroll fixes it. */
function jumpTo(root: HTMLElement, row: HTMLElement): void {
  row.scrollIntoView({ behavior: 'smooth', block: 'start' })
  clearTimeout(flashTimers.get(row))
  row.classList.remove(FLASH_CLASS)
  void row.offsetWidth // restarts the animation on a second click
  row.classList.add(FLASH_CLASS)
  flashTimers.set(row, setTimeout(() => row.classList.remove(FLASH_CLASS), FLASH_MS))
  const settle = (): void => {
    root.removeEventListener('scrollend', settle)
    clearTimeout(timer)
    if (row.isConnected && !landed(root, row)) row.scrollIntoView({ block: 'start' })
  }
  const timer = setTimeout(settle, SETTLE_MS)
  root.addEventListener('scrollend', settle)
}

/** Whether the row is out of the box's view; a row not drawn yet counts as out of view. */
function useOutOfView(scrollRef: RefObject<HTMLElement>, id: string | undefined, itemCount: number): boolean {
  // Starts hidden and keeps its last value until the observer reports, so opening a chat never flashes the strip.
  const [outOfView, setOutOfView] = useState(false)
  useEffect(() => {
    const root = scrollRef.current
    if (!root || id === undefined) return
    const row = promptRow(root, id)
    if (!row) {
      setOutOfView(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => setOutOfView(!entry.isIntersecting), { root })
    observer.observe(row)
    return () => observer.disconnect()
  }, [scrollRef, id, itemCount])
  return outOfView
}

interface Props {
  items: readonly ChatItem[]
  held?: readonly HeldPrompt[]
  /** The transcript's scroll box. */
  scrollRef: RefObject<HTMLElement>
  /** Stops the transcript following new output, so the jump is not pulled back to the bottom. */
  onLeaveBottom: () => void
}

/** The last prompt sent, at the top of the chat while it is scrolled out of view; a click scrolls back to it. */
export function LastPromptStrip({ items, held = NONE_HELD, scrollRef, onLeaveBottom }: Props) {
  const prompt = useMemo(() => lastPrompt(items, held), [items, held])
  const outOfView = useOutOfView(scrollRef, prompt?.id, items.length)
  if (!prompt || !outOfView) return null

  const jump = (): void => {
    const root = scrollRef.current
    const row = root && promptRow(root, prompt.id)
    if (!root || !row) return
    onLeaveBottom()
    jumpTo(root, row)
  }
  // One line by the strip's CSS ellipsis, its line breaks folded into spaces.
  return <SummaryStrip label="Last prompt" icon={<CornerLeftUp size={13} strokeWidth={2} />} title={prompt.text || 'Attachments only'} onClick={jump} />
}
