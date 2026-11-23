import { Gauge } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useMenu } from '../../hooks/useMenu'
import { effortLabel } from '../../state/modelPicker'
import { Pill } from '../ui/Pill'
import { Popover } from '../ui/Popover'
import { EffortRow } from './EffortRow'

/** Room for the description on one line beside the slider. */
const EFFORT_WIDTH = 320

const focusOnOpen = (slider: HTMLDivElement | null): void => slider?.focus()

interface Props {
  level: string | undefined
  /** None hides the pill: the model has no effort levels. */
  levels: string[]
  onSelect: (level: string) => void
}

/** The prompt footer's effort pill and its own popover with the Effort row. */
export function EffortPicker({ level, levels, onSelect }: Props) {
  const menu = useMenu()
  const pillRef = useRef<HTMLButtonElement | null>(null)
  const { open } = menu
  const wasOpen = useRef(false)
  useEffect(() => {
    // Esc unmounts the focused slider; focus goes back to the pill instead of the page.
    if (!open && wasOpen.current && document.activeElement === document.body) pillRef.current?.focus()
    wasOpen.current = open
  }, [open])
  if (levels.length === 0) return null
  const label = effortLabel(level)
  return (
    <>
      <span ref={menu.setAnchor} className="inline-flex shrink-0">
        <Pill
          icon={Gauge}
          label={label}
          ariaLabel={`Effort: ${label}`}
          popup="dialog"
          buttonRef={pillRef}
          onClick={menu.toggle}
          tooltip={`Effort: ${label}. Click to set how hard the model tries`}
          expanded={menu.open}
        />
      </span>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} side="above" label="Effort" width={EFFORT_WIDTH}>
        <EffortRow level={level} levels={levels} onSelect={onSelect} description="Set how hard the model tries" sliderRef={focusOnOpen} />
      </Popover>
    </>
  )
}
