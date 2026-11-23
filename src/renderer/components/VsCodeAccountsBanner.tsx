import { Fragment, useEffect } from 'react'
import { UserRoundCheck, X } from 'lucide-react'
import { joinNames, movesByAccount } from '../../shared/vscodeMatch'
import { useAccountMoves, useVsCodeMatchStore } from '../state/vscodeMatchStore'
import { Banner } from './ui/Banner'
import { Button } from './ui/Button'

/** Offers to run workspaces on the accounts VS Code uses for the same folders. */
export function VsCodeAccountsBanner() {
  const load = useVsCodeMatchStore((s) => s.load)
  const apply = useVsCodeMatchStore((s) => s.apply)
  const dismiss = useVsCodeMatchStore((s) => s.dismiss)
  const moves = useAccountMoves()

  useEffect(() => {
    void load()
  }, [load])

  if (moves.length === 0) return null
  const groups = movesByAccount(moves)
  return (
    <Banner
      label="VS Code accounts"
      actions={
        <>
          <Button onClick={() => void apply(moves)} tooltip="Run these workspaces on the same accounts as in VS Code">
            <UserRoundCheck size={12} />
            Use the same accounts
          </Button>
          <Button variant="ghost" onClick={() => void dismiss(moves)} tooltip="Hide this until VS Code ties another workspace to an account">
            <X size={12} />
            Dismiss
          </Button>
        </>
      }
    >
      VS Code uses{' '}
      {groups.map((g, i) => (
        <Fragment key={g.profileName}>
          {i > 0 && (i === groups.length - 1 ? ' and ' : ', ')}
          the <strong>{g.profileName}</strong> account for {joinNames(g.workspaceNames)}
        </Fragment>
      ))}
      .
    </Banner>
  )
}
