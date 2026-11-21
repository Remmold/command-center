import { Gauge } from 'lucide-react'
import { effortLabel, nextEffort } from '../../state/modelPicker'
import { LevelSlider } from '../ui/LevelSlider'
import { SettingRow } from '../ui/SettingRow'

interface Props {
  level: string | undefined
  levels: string[]
  onSelect: (level: string) => void
  description?: string
}

/** The extension's Effort row: click cycles the level, the slider picks one. */
export function EffortRow({ level, levels, onSelect, description }: Props) {
  return (
    <SettingRow
      icon={Gauge}
      label="Effort"
      suffix={`(${effortLabel(level)})`}
      description={description}
      tooltip="Click to cycle effort level"
      onClick={() => onSelect(nextEffort(levels, level))}
      trailing={
        <LevelSlider
          levels={levels}
          value={level}
          onSelect={onSelect}
          label="Effort level"
          tooltip="Click or drag to set effort level"
        />
      }
    />
  )
}
