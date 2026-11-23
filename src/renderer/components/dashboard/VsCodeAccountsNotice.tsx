import { X } from 'lucide-react'
import { useViewStore } from '../../state/viewStore'
import { useAccountMoves, useVsCodeMatchStore } from '../../state/vscodeMatchStore'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { NoticeLine } from '../ui/NoticeLine'

/** Points at the Settings banner once, so the suggestion is found without opening Settings. */
export function VsCodeAccountsNotice() {
  const noticeDismissed = useVsCodeMatchStore((s) => s.match?.noticeDismissed ?? true)
  const dismissNotice = useVsCodeMatchStore((s) => s.dismissNotice)
  const openSettings = useViewStore((s) => s.openSettings)
  const moves = useAccountMoves()
  if (noticeDismissed || moves.length === 0) return null
  return (
    <NoticeLine
      action={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              void dismissNotice()
              openSettings('accounts')
            }}
          >
            Review in Settings
          </Button>
          <IconButton label="Dismiss notice" onClick={() => void dismissNotice()}>
            <X size={12} />
          </IconButton>
        </>
      }
    >
      VS Code runs some workspaces on other accounts.
    </NoticeLine>
  )
}
