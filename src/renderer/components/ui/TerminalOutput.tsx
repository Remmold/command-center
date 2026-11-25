import { useLayoutEffect, useRef } from 'react'

/** Read-only terminal text that follows its end, unless scrolled up. */
export function TerminalOutput({ text, label }: { text: string; label: string }) {
  const ref = useRef<HTMLPreElement | null>(null)
  const following = useRef(true)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && following.current) el.scrollTop = el.scrollHeight
  }, [text])
  return (
    <pre
      ref={ref}
      aria-label={label}
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget
        following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4
      }}
      className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-subtle bg-editor px-2.5 py-1.5 font-mono text-[11px] leading-4 text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
    >
      {text}
    </pre>
  )
}
