import { useEffect, useRef } from 'react'
import { SquareArrowOutUpRight } from 'lucide-react'
import { DRAWER_MIN_WIDTH, useChatDrawerStore } from '../../state/chatDrawer'
import { openSession } from '../../state/sessionNavigation'
import type { HostedRow } from '../../state/sessionList'
import { AccountTag } from '../AccountTag'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CardMeta, CardMetaText, CardTitle } from '../ui/Card'
import { Drawer } from '../ui/Drawer'
import { StatusTag } from '../ui/StatusDot'

function closeDrawer(): void {
  useChatDrawerStore.getState().close()
}

function openInWork(paneId: string): void {
  if (openSession(paneId)) closeDrawer()
}

/** The drawer's chat area. The session's chat stays mounted in Work and is laid over this box (ADR 0004). */
function ChatSlot() {
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const { setSlot } = useChatDrawerStore.getState()
    const measure = (): void => {
      const r = el.getBoundingClientRect()
      setSlot({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      setSlot(null)
    }
  }, [])

  return <div ref={box} data-testid="chat-drawer-slot" className="absolute inset-0" />
}

export function ChatDrawer({ row, account }: { row: HostedRow; account?: string }) {
  const share = useChatDrawerStore((s) => s.share)
  const setShare = useChatDrawerStore((s) => s.setShare)
  return (
    <Drawer
      label="Chat"
      onClose={closeDrawer}
      share={share}
      minWidth={DRAWER_MIN_WIDTH}
      onResize={setShare}
      flush
      actions={
        <Button variant="ghost" onClick={() => openInWork(row.paneId)}>
          <SquareArrowOutUpRight size={14} />
          Open in Work
        </Button>
      }
      title={
        <>
          <CardMeta>
            <RepoIcon repoGroupKey={row.workspace.repoGroupKey} repoName={row.workspace.repoName} size="sm" />
            {row.workspace.worktreeTag && <Badge>{row.workspace.worktreeTag}</Badge>}
            <CardMetaText>{row.repoName}</CardMetaText>
            <AccountTag label={account} />
            <StatusTag status={row.status} />
          </CardMeta>
          <CardTitle>{row.title}</CardTitle>
        </>
      }
    >
      <ChatSlot />
    </Drawer>
  )
}
