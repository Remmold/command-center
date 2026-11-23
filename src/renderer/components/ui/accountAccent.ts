import type { AccountColor } from '../../state/accountColors'

/** A CSS colour for inline fills, e.g. a swatch. */
export function accentFill(color: AccountColor): string {
  return `rgb(var(--cc-account-${color}))`
}

/** Whole class names per accent, so Tailwind sees them. */
export const ACCENT_DOT: Record<AccountColor, string> = {
  blue: 'bg-account-blue',
  orange: 'bg-account-orange',
  purple: 'bg-account-purple',
  teal: 'bg-account-teal',
  green: 'bg-account-green',
  red: 'bg-account-red'
}

export const ACCENT_EDGE: Record<AccountColor, string> = {
  blue: 'border-l-account-blue',
  orange: 'border-l-account-orange',
  purple: 'border-l-account-purple',
  teal: 'border-l-account-teal',
  green: 'border-l-account-green',
  red: 'border-l-account-red'
}

export const ACCENT_RING: Record<AccountColor, string> = {
  blue: 'ring-account-blue',
  orange: 'ring-account-orange',
  purple: 'ring-account-purple',
  teal: 'ring-account-teal',
  green: 'ring-account-green',
  red: 'ring-account-red'
}
