import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Which hovered `group/…` ancestor reveals the button; it always shows on keyboard focus. */
export type CopyReveal = 'code' | 'message'

const REVEAL: Record<CopyReveal, string> = {
  code: 'opacity-0 group-hover/code:opacity-100',
  message: 'opacity-0 group-hover/message:opacity-100'
}

const COPIED_MS = 2000

interface Props {
  getText: () => string
  /** The tooltip; the screen reader hears "<label> to clipboard", as in the extension. */
  label?: string
  reveal: CopyReveal
  /** The code-block variant sits on a surface and needs its own border. */
  framed?: boolean
}

/** The extension's copy button: a copy icon that turns into a check for two seconds after copying. */
export function CopyButton({ getText, label = 'Copy code', reveal, framed = false }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = (): void => {
    void navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
    }, () => undefined)
  }

  const Icon = copied ? Check : Copy
  return (
    <button
      type="button"
      onClick={copy}
      title={label}
      aria-label={`${label} to clipboard`}
      data-copied={copied || undefined}
      className={
        'flex items-center justify-center rounded text-muted transition-opacity hover:text-fg focus-visible:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus ' +
        (framed ? 'border border-strong bg-sidebar p-1 hover:bg-list-hover ' : 'p-0.5 hover:bg-list-hover ') +
        REVEAL[reveal]
      }
    >
      <Icon size={14} />
    </button>
  )
}
