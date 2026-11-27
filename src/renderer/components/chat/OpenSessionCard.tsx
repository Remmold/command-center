import type { ActionState } from '../../../shared/actionBlocks'
import { OPEN_SESSION_TAG } from '../../../shared/openSession'
import { ActionCardShell, CardField } from './ActionCardShell'
import { useToolContext } from './toolContext'

/** A feature whose session the main chat offers to show; the same Open session as the Features group's. */
export function OpenSessionCard({ fields, state }: { cardKey: string; fields: Record<string, string>; state: ActionState }) {
  const { actions } = useToolContext()
  const name = fields.feature
  return (
    <ActionCardShell
      tag={OPEN_SESSION_TAG}
      title="Open session"
      subject={name}
      state={state}
      doneNote="Opened"
      preflight={actions ? async () => actions.openSession.check(name) : null}
      preflightKey={[name, ...(actions?.featureNames ?? [])].join('\n')}
      button="Open session"
      running="Opening…"
      run={async () => actions?.openSession.open(name)}
      failed="The session did not open"
    >
      <CardField label="Feature">{name}</CardField>
    </ActionCardShell>
  )
}
