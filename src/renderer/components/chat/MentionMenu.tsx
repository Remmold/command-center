import { File, Folder } from 'lucide-react'
import { SuggestionEmpty, SuggestionOption, SuggestionPopup } from '../ui/SuggestionList'
import type { MentionEntry } from '../../../shared/types'

interface Props {
  entries: readonly MentionEntry[]
  activeIndex: number
  onHover: (index: number) => void
  /** `drill` is true for a click on a folder, as Tab: the menu stays open inside it. */
  onPick: (entry: MentionEntry, drill: boolean) => void
}

/** The extension's @ suggestion list: a file shows its name then its folder; a folder shows its path. */
export function MentionMenu({ entries, activeIndex, onHover, onPick }: Props) {
  return (
    <SuggestionPopup label="Suggestions">
      {entries.length === 0 ? (
        <SuggestionEmpty>No files found</SuggestionEmpty>
      ) : (
        entries.map((entry, i) => {
          const folder = entry.type === 'directory'
          return (
            <SuggestionOption
              key={entry.path}
              active={i === activeIndex}
              icon={folder ? <Folder size={14} strokeWidth={1.75} /> : <File size={14} strokeWidth={1.75} />}
              detail={folder ? undefined : entry.path.slice(0, entry.path.length - entry.name.length) || undefined}
              onHover={() => onHover(i)}
              onPick={() => onPick(entry, folder)}
            >
              {folder ? entry.path : entry.name}
            </SuggestionOption>
          )
        })
      )}
    </SuggestionPopup>
  )
}
