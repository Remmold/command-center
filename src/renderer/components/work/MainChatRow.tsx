import { MessageCircleQuestion } from 'lucide-react'
import { MAIN_CHAT_PANE_ID, MAIN_CHAT_TITLE } from '../../../shared/mainChat'
import { openMainChat, useMainChatStore } from '../../state/mainChatStore'
import { useProfilesStore } from '../../state/profilesStore'
import { useSessionStatusStore } from '../../state/sessionStatusStore'
import { ListRow, ListRowLabel, ListRowText } from '../ui/ListRow'
import { StatusDot } from '../ui/StatusDot'

/** The permanent chat for questions about every feature, pinned above the rest of the list. */
export function MainChatRow() {
  const info = useMainChatStore((s) => s.info)
  const status = useSessionStatusStore((s) => s.byPane[MAIN_CHAT_PANE_ID]?.status ?? 'idle')
  const account = useProfilesStore((s) => s.profiles.find((p) => p.id === info?.profileId)?.name)
  return (
    <ul>
      <ListRow rowKey="main-chat" size="roomy" onClick={() => void openMainChat()} tooltip="Ask about any feature. It answers from the feature digest and can only read, never act.">
        <MessageCircleQuestion size={14} className="shrink-0 text-muted" />
        <ListRowText primary={MAIN_CHAT_TITLE} />
        {account && (
          <ListRowLabel tone="secondary" hideWhenNarrow>
            {account}
          </ListRowLabel>
        )}
        <StatusDot status={status} look="soft" />
      </ListRow>
    </ul>
  )
}
