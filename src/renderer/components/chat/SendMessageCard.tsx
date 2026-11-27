import { useMemo } from 'react'
import type { ActionState } from '../../../shared/actionBlocks'
import { SEND_MESSAGE_TAG, sendMessageOf, type QueuedSend } from '../../../shared/sendMessage'
import { featureMessages } from '../../state/featureMessages'
import { useQueuedSend } from '../../state/messageQueue'
import { ActionCardShell, CardField } from './ActionCardShell'
import { useToolContext } from './toolContext'

const NOTE: Record<QueuedSend['state'], string> = { sent: 'Sent', queued: 'Queued', replaced: 'Replaced', failed: 'Not delivered' }

/** A message the main chat offers to send to a feature's session, shown exactly as it will be sent. */
export function SendMessageCard({ cardKey, fields, state }: { cardKey: string; fields: Record<string, string>; state: ActionState }) {
  const { actions } = useToolContext()
  const block = useMemo(() => sendMessageOf(fields), [fields])
  const sent = useQueuedSend(featureMessages, cardKey)
  return (
    <ActionCardShell
      tag={SEND_MESSAGE_TAG}
      title="Send message"
      subject={block.feature}
      state={state}
      doneNote={sent ? NOTE[sent.state] : 'Sent'}
      preflight={actions ? async () => actions.sendMessage.check(block.feature) : null}
      preflightKey={[block.feature, ...(actions?.featureNames ?? [])].join('\n')}
      button="Send"
      running="Sending…"
      run={async () => actions?.sendMessage.send(cardKey, block)}
      failed="The message was not sent"
    >
      <CardField label="Feature">{block.feature}</CardField>
      <CardField label="Message" verbatim>
        {block.message}
      </CardField>
      {sent?.state === 'queued' && (
        <p data-action-queue="queued" className="text-muted">
          {`Queued, sends when ${block.feature} finishes its turn`}
        </p>
      )}
      {sent?.state === 'replaced' && (
        <p data-action-queue="replaced" className="text-muted">
          {`Replaced by a newer message to ${block.feature}; this one will not be sent`}
        </p>
      )}
      {sent?.state === 'failed' && state === 'done' && (
        <p data-action-queue="failed" role="alert" className="text-error">
          {`Not delivered: ${sent.error}`}
        </p>
      )}
    </ActionCardShell>
  )
}
