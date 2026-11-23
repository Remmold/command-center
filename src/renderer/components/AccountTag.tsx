import { useAccounts } from '../state/useAccounts'
import { useAccountColor } from '../state/useAccountColor'
import { AccentDot } from './ui/AccentDot'
import { Badge } from './ui/Badge'

/** The account a row belongs to, e.g. "Work · Team", with its colour; nothing without a label. */
export function AccountTag({ label }: { label: string | undefined }) {
  const profileId = useAccounts().find((a) => a.label === label)?.profileId ?? null
  const color = useAccountColor(profileId)
  if (!label) return null
  return (
    <Badge tooltip={`Account: ${label}`}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <AccentDot color={color} />
        <span className="truncate">{label}</span>
      </span>
    </Badge>
  )
}
