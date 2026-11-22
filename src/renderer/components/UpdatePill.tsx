import { RotateCw } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { findSessionByPane, useProjectViewsStore } from '../state/projectViewsStore'
import { useUpdateStore } from '../state/updateStore'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { StatusPill } from './ui/StatusPill'

export function busyQuestion(count: number): string {
  return count === 1 ? '1 chat is working. Restart anyway?' : `${count} chats are working. Restart anyway?`
}

/** "Restart to update" once an update is downloaded; asks first while chats are working. */
export function UpdatePill() {
  const downloaded = useUpdateStore((s) => s.status?.downloaded ?? null)
  const confirming = useUpdateStore((s) => s.confirming)
  const restart = useUpdateStore((s) => s.restart)
  const cancel = useUpdateStore((s) => s.cancel)
  const names = useProjectViewsStore(useShallow((s) => (confirming ?? []).map((paneId) => findSessionByPane(s, paneId)?.session.title || 'New session')))

  if (!downloaded) return null
  return (
    <div className="shrink-0 px-2">
      <StatusPill
        label="Restart to update"
        icon={<RotateCw size={11} strokeWidth={2} />}
        tone="on"
        tooltip={`Version ${downloaded} is ready. Restart to install it.`}
        onClick={() => void restart(false)}
      />
      {confirming && (
        <ConfirmDialog
          title="Restart to update"
          message={busyQuestion(confirming.length)}
          confirmLabel="Restart"
          onConfirm={() => void restart(true)}
          onCancel={cancel}
          items={names}
        />
      )}
    </div>
  )
}
