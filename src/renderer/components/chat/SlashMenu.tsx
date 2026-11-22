import { useEffect, useRef, type ReactNode } from 'react'
import type { MenuCommand, MenuSection } from './slashMenuModel'
import { SuggestionEmpty, SuggestionPopup } from '../ui/SuggestionList'

interface Props {
  sections: readonly MenuSection[]
  activeId: string | null
  onSelect: (cmd: MenuCommand) => void
  onHover: (id: string) => void
  /** Extra content at the end of a row, by command id (a toggle, the current model). */
  trailing?: Readonly<Record<string, ReactNode>>
}

/** The extension's inline command menu: sections over a listbox, above the prompt. */
export function SlashMenu({ sections, activeId, onSelect, onHover, trailing = {} }: Props) {
  const activeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  return (
    <SuggestionPopup label="Actions">
      {sections.length === 0 ? (
        <SuggestionEmpty>No matching commands</SuggestionEmpty>
      ) : (
        sections.map((section, i) => (
          <div key={section.name} role="group" aria-label={section.name}>
            {i > 0 && <div aria-hidden="true" className="my-1 h-px bg-strong" />}
            <div role="presentation" className="px-3 py-1 text-[11px] text-muted">
              {section.name}
            </div>
            {section.commands.map((cmd) => {
              const active = cmd.id === activeId
              return (
                <div
                  key={cmd.id}
                  ref={active ? activeRef : null}
                  role="option"
                  aria-selected={active}
                  title={cmd.description}
                  onMouseMove={() => onHover(cmd.id)}
                  onClick={() => onSelect(cmd)}
                  className={
                    'mx-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-fg ' +
                    (active ? 'bg-list-selected' : '')
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                  {trailing[cmd.id]}
                </div>
              )
            })}
          </div>
        ))
      )}
    </SuggestionPopup>
  )
}
