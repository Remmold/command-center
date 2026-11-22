import { Badge } from './ui/Badge'

/** The account a row belongs to, e.g. "Work · Team"; nothing without a label. */
export function AccountTag({ label }: { label: string | undefined }) {
  return label ? <Badge tooltip={`Account: ${label}`}>{label}</Badge> : null
}
