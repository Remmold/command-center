import type { AccountColor } from '../../state/accountColors'
import { ACCENT_DOT } from './accountAccent'

/** A small round swatch of an account's accent; a hollow ring when there is no account. */
export function AccentDot({ color, size = 'sm' }: { color: AccountColor | null; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-3 w-3' : 'h-2 w-2'
  const fill = color ? ACCENT_DOT[color] : 'border border-muted'
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${box} ${fill}`} />
}
