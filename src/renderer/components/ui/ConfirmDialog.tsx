import { useEffect, useRef } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'

interface Props {
  title: string
  message: string
  /** Listed under the message, e.g. the things the action affects. */
  items?: readonly string[]
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** A yes/no question where Cancel is the default: it holds the focus, and Escape or a click outside cancels. */
export function ConfirmDialog({ title, message, items = [], confirmLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => cancelRef.current?.focus(), [])
  return (
    <Dialog title={title} onClose={onCancel} maxWidth={400}>
      <p>{message}</p>
      {items.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-muted">
          {items.map((item, i) => (
            <li key={i} className="truncate">
              {item}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button ref={cancelRef} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Dialog>
  )
}
