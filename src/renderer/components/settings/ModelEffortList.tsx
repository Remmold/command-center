import { useState } from 'react'
import { X } from 'lucide-react'
import { isSettingsObject, keyPath } from '../../../shared/claudeSettings'
import { EFFORT_OPTIONS } from '../../../shared/claudeSettingsCatalog'
import { FormRow } from '../ui/FormRow'
import { IconButton } from '../ui/IconButton'
import { Select } from '../ui/Select'
import { TextField } from '../ui/TextField'

interface Props {
  /** The layer's `modelSettings`, with its waiting changes. */
  value: unknown
  disabled: boolean
  onStage: (key: string, value: unknown) => void
}

const effortPath = (model: string): string => keyPath('modelSettings', model, 'effortLevel')

function savedEfforts(value: unknown): [model: string, level: string][] {
  if (!isSettingsObject(value)) return []
  return Object.entries(value).flatMap(([model, settings]) => (isSettingsObject(settings) && typeof settings.effortLevel === 'string' ? [[model, settings.effortLevel]] : []))
}

/** One row per model with a saved effort; a model can be added at a level, or have its level removed. */
export function ModelEffortList({ value, disabled, onStage }: Props) {
  const [newLevel, setNewLevel] = useState('high')
  return (
    <div>
      {savedEfforts(value).map(([model, level]) => (
        <FormRow
          key={model}
          label={model}
          control={
            <>
              <Select label={`Effort for ${model}`} options={EFFORT_OPTIONS} value={level} disabled={disabled} onChange={(next) => onStage(effortPath(model), next)} />
              {!disabled && (
                <IconButton label={`Remove ${model}`} tooltip="Remove its saved effort" onClick={() => onStage(effortPath(model), undefined)}>
                  <X size={12} />
                </IconButton>
              )}
            </>
          }
        />
      ))}
      <FormRow
        label="Add a model"
        description="Its full id, such as claude-opus-5-5, then Enter."
        control={
          <>
            <TextField label="Model id" placeholder="Model id" disabled={disabled} onSubmit={(model) => onStage(effortPath(model), newLevel)} />
            <Select label="Effort for the new model" options={EFFORT_OPTIONS} value={newLevel} disabled={disabled} onChange={setNewLevel} />
          </>
        }
      />
    </div>
  )
}
