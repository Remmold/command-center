import type { SettingsLayer } from '../../../shared/claudeSettings'
import { defaultText, formatSettingValue, layerRule, type SettingEntry } from '../../../shared/claudeSettingsCatalog'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { FormRow } from '../ui/FormRow'
import { Select } from '../ui/Select'
import { TextField } from '../ui/TextField'

/** What a row shows of the value that applies in the workspace. */
export interface ShownEffective {
  value: unknown
  /** "From Account", "Overridden by Local", …; null when no layer sets it. */
  badge: string | null
  locked: boolean
}

interface Props {
  entry: SettingEntry
  layer: SettingsLayer
  value: unknown
  effective: ShownEffective
  changed: boolean
  /** Set when the file on disk changed this waiting key since it was edited; holds the file's value now. */
  fileValue?: { value: unknown }
  disabled: boolean
  onChange: (value: unknown) => void
  onReset: () => void
}

const NOT_SET = ''

function parseInput(entry: SettingEntry, text: string): unknown {
  if (entry.control.kind === 'number') {
    const n = Number(text)
    return Number.isFinite(n) ? n : undefined
  }
  if (entry.control.kind === 'stringList') return text.split(',').map((s) => s.trim()).filter(Boolean)
  return text
}

function Control({ entry, layer, value, disabled, onChange }: Pick<Props, 'entry' | 'layer' | 'value' | 'disabled' | 'onChange'>) {
  const { control } = entry
  switch (control.kind) {
    case 'toggle':
      return (
        <Checkbox checked={value === true} disabled={disabled} onChange={onChange}>
          On
        </Checkbox>
      )
    case 'choice': {
      const current = typeof value === 'string' ? value : NOT_SET
      const known = control.options.some((o) => o.value === current)
      const options = [
        { value: NOT_SET, label: 'Not set' },
        ...control.options.filter((o) => !o.layers || o.layers.includes(layer) || o.value === current),
        ...(current !== NOT_SET && !known ? [{ value: current, label: current }] : [])
      ]
      return <Select label={entry.label} options={options} value={current} disabled={disabled} onChange={(v) => onChange(v === NOT_SET ? undefined : v)} />
    }
    case 'number':
    case 'text':
    case 'stringList':
      return (
        <TextField
          key={formatSettingValue(entry, value)}
          label={entry.label}
          initialValue={value === undefined ? '' : formatSettingValue(entry, value)}
          placeholder="Not set"
          disabled={disabled}
          submitOnBlur
          keepOnSubmit
          onSubmit={(text) => {
            const parsed = parseInput(entry, text)
            if (parsed !== undefined) onChange(parsed)
          }}
        />
      )
    case 'editor':
      return <span className="text-muted">{formatSettingValue(entry, value)}</span>
  }
}

/** One catalog setting as a row: its words, raw key, control, default and the value that applies. */
export function SettingField({ entry, layer, value, effective, changed, fileValue, disabled, onChange, onReset }: Props) {
  const notHere = layerRule(entry, layer)
  const ignoredValue = notHere === null && value !== undefined ? layerRule(entry, layer, value) : null
  const risk = entry.risk?.(value) ?? null
  return (
    <FormRow
      label={entry.label}
      hint={entry.key}
      description={entry.description}
      notes={
        <>
          {effective.badge === null ? (
            <span>{defaultText(entry)}</span>
          ) : (
            <span>
              Applies: {formatSettingValue(entry, effective.value)} <Badge tone={effective.locked ? 'quiet-warning' : 'quiet'}>{effective.badge}</Badge>
            </span>
          )}
          {notHere && <span>{notHere}</span>}
          {ignoredValue && <Badge tone="quiet-warning">{ignoredValue}</Badge>}
          {risk && <Badge tone="warning">{risk}</Badge>}
          {entry.newChatsOnly && <Badge tone="quiet">Applies to new chats</Badge>}
          {changed && <Badge tone="muted">Changed</Badge>}
          {fileValue && <Badge tone="quiet-warning">The file now has {formatSettingValue(entry, fileValue.value)}: Save asks which to keep</Badge>}
          {value !== undefined && (
            <Button variant="link" disabled={disabled} tooltip="Remove it from this layer’s file" onClick={onReset}>
              Reset
            </Button>
          )}
        </>
      }
      control={<Control entry={entry} layer={layer} value={value} disabled={disabled || notHere !== null || effective.locked} onChange={onChange} />}
    />
  )
}
