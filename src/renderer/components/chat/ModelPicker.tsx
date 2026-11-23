import { useEffect, useRef } from 'react'
import type { CliModel } from '../../../shared/types'
import { useMenu } from '../../hooks/useMenu'
import { DEFAULT_MODEL, pickerModels, type Pill as PillText } from '../../state/modelPicker'
import { MenuItem } from '../ui/MenuItem'
import { Pill } from '../ui/Pill'
import { Popover, PopoverDivider, PopoverHeading, PopoverMenu, PopoverNote, PopoverSection } from '../ui/Popover'
import { EffortRow } from './EffortRow'

interface Props {
  models: CliModel[]
  /** The model in use; unset is the CLI's default. */
  current: string | undefined
  pill: PillText
  effort: string | undefined
  levels: string[]
  onSelectModel: (model: string) => void
  onSelectEffort: (level: string) => void
  /** Each change opens the menu, as /model and "Switch model…" do. */
  openSignal?: number
}

/** The prompt footer's model pill and its "Select a model" menu. */
export function ModelPicker({ models, current, pill, effort, levels, onSelectModel, onSelectEffort, openSignal = 0 }: Props) {
  const menu = useMenu()
  const seen = useRef(openSignal)
  const { show } = menu
  useEffect(() => {
    if (openSignal === seen.current) return
    seen.current = openSignal
    show()
  }, [openSignal, show])
  const rows = pickerModels(models)
  const currentValue = current ?? DEFAULT_MODEL
  return (
    <>
      <span ref={menu.setAnchor} className="inline-flex shrink-0">
        <Pill label={pill.label} detail={pill.effort} onClick={menu.toggle} tooltip="Switch model" expanded={menu.open} />
      </span>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} side="above" label="Select a model">
        {rows.length === 0 ? (
          <PopoverSection>
            <PopoverNote>Loading models…</PopoverNote>
          </PopoverSection>
        ) : (
          <>
            <PopoverHeading title="Select a model" />
            <PopoverMenu label="Select a model">
              {rows.map((m) => (
                <MenuItem
                  key={m.value}
                  label={m.displayName}
                  description={m.description}
                  checked={m.value === currentValue}
                  onClick={() => {
                    menu.close()
                    onSelectModel(m.value)
                  }}
                />
              ))}
            </PopoverMenu>
          </>
        )}
        {levels.length > 0 && (
          <>
            <PopoverDivider />
            <EffortRow level={effort} levels={levels} onSelect={onSelectEffort} description="Set how hard the model tries" />
          </>
        )}
      </Popover>
    </>
  )
}
