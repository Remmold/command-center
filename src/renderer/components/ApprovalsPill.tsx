import { APPROVALS_SHORTCUT } from '../hooks/useKeyboardShortcuts'
import { useApprovalInboxStore } from '../state/approvalInboxStore'
import { useApprovalsStore } from '../state/approvalsStore'
import { Badge } from './ui/Badge'
import { TitleBarButton } from './ui/TitleBarButton'

export const approvalCountLabel = (count: number): string => `${count} ${count === 1 ? 'approval' : 'approvals'}`

/** "3 approvals" in the title bar while any hosted chat waits on one; opens the approval inbox. Hidden at none. */
export function ApprovalsPill() {
  const count = useApprovalsStore((s) => Object.values(s.byPane).reduce((n, list) => n + list.length, 0))
  const open = useApprovalInboxStore((s) => s.open)
  if (count === 0) return null
  const label = approvalCountLabel(count)
  return (
    <TitleBarButton label={label} tooltip={`Answer waiting approvals (${APPROVALS_SHORTCUT})`} pressed={open} onClick={() => useApprovalInboxStore.getState().toggle()}>
      <Badge tone="waiting">{label}</Badge>
    </TitleBarButton>
  )
}
