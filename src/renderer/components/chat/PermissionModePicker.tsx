import { Ban, FileEdit, Hand, ListChecks, ShieldOff, Sparkles, type LucideIcon } from 'lucide-react'
import { useMenu } from '../../hooks/useMenu'
import { MODE_INFO, type PermissionMode } from '../../state/permissionModes'
import { Button } from '../ui/Button'
import { MenuItem } from '../ui/MenuItem'
import { Popover, PopoverDivider, PopoverHeading, PopoverMenu } from '../ui/Popover'
import { EffortRow } from './EffortRow'

const MODE_ICON: Record<PermissionMode, LucideIcon> = {
  default: Hand,
  acceptEdits: FileEdit,
  plan: ListChecks,
  auto: Sparkles,
  bypassPermissions: ShieldOff,
  dontAsk: Ban
}

interface Props {
  mode: PermissionMode
  modes: PermissionMode[]
  onSelect: (mode: PermissionMode) => void
  /** The Effort row below the modes, for a model that supports effort. */
  effort?: { level: string | undefined; levels: string[]; onSelect: (level: string) => void }
}

/** The prompt footer's permission mode button and its "Modes" menu. */
export function PermissionModePicker({ mode, modes, onSelect, effort }: Props) {
  const menu = useMenu()
  const info = MODE_INFO[mode]
  const Icon = MODE_ICON[mode]
  return (
    <>
      <span ref={menu.setAnchor} className="inline-flex">
        <Button
          variant="ghost"
          pressed={menu.open}
          onClick={menu.toggle}
          tooltip={`${info.description}. Click to change, or press Shift+Tab to cycle.`}
        >
          <Icon size={13} strokeWidth={2} />
          {info.label}
        </Button>
      </span>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" side="above" label="Modes">
        <PopoverHeading title="Modes" hint="⇧ + tab to switch" />
        <PopoverMenu label="Modes">
          {modes.map((m) => (
            <MenuItem
              key={m}
              icon={MODE_ICON[m]}
              label={MODE_INFO[m].label}
              description={MODE_INFO[m].description}
              checked={m === mode}
              onClick={() => {
                menu.close()
                onSelect(m)
              }}
            />
          ))}
        </PopoverMenu>
        {effort && effort.levels.length > 0 && (
          <>
            <PopoverDivider />
            <EffortRow level={effort.level} levels={effort.levels} onSelect={effort.onSelect} />
          </>
        )}
      </Popover>
    </>
  )
}
