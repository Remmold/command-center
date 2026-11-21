import { notAddedRepos } from '../../state/boardLayout'
import { useBoardStore } from '../../state/boardStore'
import { useViewStore } from '../../state/viewStore'
import { Button } from '../ui/Button'
import { NoticeLine } from '../ui/NoticeLine'

/** One line above the board when repos with tickets aren't workspaces yet; nothing otherwise. */
export function NotAddedLine() {
  const repos = useBoardStore((s) => s.discovery.repos)
  const openSettings = useViewStore((s) => s.openSettings)
  const count = notAddedRepos(repos, false).length
  if (count === 0) return null

  return (
    <NoticeLine
      action={
        <Button variant="ghost" onClick={() => openSettings('board')} tooltip="Settings → Board">
          Review
        </Button>
      }
    >
      {count} {count === 1 ? 'repo with tickets isn’t' : 'repos with tickets aren’t'} added
    </NoticeLine>
  )
}
