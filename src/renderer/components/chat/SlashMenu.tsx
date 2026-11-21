import { useEffect, useRef, type ReactNode } from 'react'
import type { MenuCommand, MenuSection } from './slashMenuModel'

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
    <div
      className="absolute bottom-full left-0 right-0 z-20 mb-2 flex max-h-[50vh] flex-col overflow-hidden rounded-md border border-strong bg-widget shadow-xl"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div role="listbox" aria-label="Actions" className="scrollbar-thin flex max-h-[300px] flex-col overflow-y-auto pb-2 pt-1">
        {sections.length === 0 ? (
          <div role="option" aria-disabled="true" aria-selected={false} className="px-2 pb-1 pt-2 text-center text-xs text-muted">
            No matching commands
          </div>
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
      </div>
    </div>
  )
}
