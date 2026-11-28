import type { ComponentType } from 'react'
import { ACTION_NOT_UNDERSTOOD, actionKey, actionSegments, type ActionState } from '../../../shared/actionBlocks'
import { ADOPT_TAG } from '../../../shared/adoptWork'
import { PROPOSAL_NOT_UNDERSTOOD, PROPOSAL_TAG } from '../../../shared/featureProposal'
import { ACTION_BLOCKS } from '../../../shared/mainChatActions'
import { HOUSEKEEPING_TAG } from '../../../shared/housekeeping'
import { OPEN_SESSION_TAG } from '../../../shared/openSession'
import { SEND_MESSAGE_TAG } from '../../../shared/sendMessage'
import { Markdown } from '../ui/Markdown'
import { AdoptWorkCard } from './AdoptWorkCard'
import { HousekeepingCard } from './HousekeepingCard'
import { OpenSessionCard } from './OpenSessionCard'
import { ProposalCard } from './ProposalCard'
import { SendMessageCard } from './SendMessageCard'
import { useToolContext } from './toolContext'

interface CardView {
  Card: ComponentType<{ cardKey: string; fields: Record<string, string>; state: ActionState }>
  /** The note under a block of this kind that did not parse. */
  notUnderstood: string
}

/** The card each registered kind is drawn as; a new kind adds its card here and its block to `ACTION_BLOCKS`. */
const CARDS: Record<string, CardView> = {
  [PROPOSAL_TAG]: { Card: ProposalCard, notUnderstood: PROPOSAL_NOT_UNDERSTOOD },
  [OPEN_SESSION_TAG]: { Card: OpenSessionCard, notUnderstood: ACTION_NOT_UNDERSTOOD },
  [ADOPT_TAG]: { Card: AdoptWorkCard, notUnderstood: ACTION_NOT_UNDERSTOOD },
  [SEND_MESSAGE_TAG]: { Card: SendMessageCard, notUnderstood: ACTION_NOT_UNDERSTOOD },
  [HOUSEKEEPING_TAG]: { Card: HousekeepingCard, notUnderstood: ACTION_NOT_UNDERSTOOD }
}

function ActionCard({ tag, fields, cardKey }: { tag: string; fields: Record<string, string>; cardKey: string }) {
  const { actions } = useToolContext()
  const view = CARDS[tag]
  return view ? <view.Card cardKey={cardKey} fields={fields} state={actions?.states.get(cardKey) ?? 'superseded'} /> : null
}

/** A reply's text with each action block drawn as a card; a block that did not parse stays text, with a note. */
export function ActionBlocksText({ text, itemId, block }: { text: string; itemId: string; block: number }) {
  return (
    <>
      {actionSegments(text, ACTION_BLOCKS).map((segment, s) => {
        if (segment.kind === 'text') return <Markdown key={s} text={segment.text} />
        if (segment.kind === 'invalid') {
          return (
            <div key={s}>
              <Markdown text={segment.raw} />
              <p data-action-note="" className="text-xs text-muted">
                {CARDS[segment.tag]?.notUnderstood ?? ACTION_NOT_UNDERSTOOD}
              </p>
            </div>
          )
        }
        return <ActionCard key={s} tag={segment.tag} fields={segment.fields} cardKey={actionKey(itemId, block, s)} />
      })}
    </>
  )
}
