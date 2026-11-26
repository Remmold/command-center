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

export const ACCENT_RING: Record<AccountColor, string> = {
  blue: 'ring-account-blue',
  orange: 'ring-account-orange',
  purple: 'ring-account-purple',
  teal: 'ring-account-teal',
  green: 'ring-account-green',
  red: 'ring-account-red'
}

/** A tag in an account's accent: tinted fill, accent text. */
export const ACCENT_TAG: Record<AccountColor, string> = {
  blue: 'bg-account-blue/15 text-account-blue',
  orange: 'bg-account-orange/15 text-account-orange',
  purple: 'bg-account-purple/15 text-account-purple',
  teal: 'bg-account-teal/15 text-account-teal',
  green: 'bg-account-green/15 text-account-green',
  red: 'bg-account-red/15 text-account-red'
}
