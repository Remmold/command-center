import { defaultText, formatSettingValue, type SettingEntry } from '../../../shared/claudeSettingsCatalog'
import { Badge } from '../ui/Badge'
import { Checkbox } from '../ui/Checkbox'
import { FormRow } from '../ui/FormRow'
import { Select } from '../ui/Select'
import { TextField } from '../ui/TextField'

interface Props {
  entry: SettingEntry
  value: unknown
  changed: boolean
  disabled: boolean
  onChange: (value: unknown) => void
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

function Control({ entry, value, disabled, onChange }: Omit<Props, 'changed'>) {
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
        ...control.options,
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
          onSubmit={(text) => onChange(parseInput(entry, text))}
          onCancel={() => onChange(undefined)}
        />
      )
    case 'editor':
      return <span className="text-muted">{formatSettingValue(entry, value)}</span>
  }
}

/** One catalog setting as a row: its words, raw key, control and default. */
export function SettingField({ entry, value, changed, disabled, onChange }: Props) {
  return (
    <FormRow
      label={entry.label}
      hint={entry.key}
      description={entry.description}
      notes={
        <>
          {value === undefined && <span>{defaultText(entry)}</span>}
          {entry.newChatsOnly && <Badge tone="quiet">Applies to new chats</Badge>}
          {changed && <Badge tone="muted">Changed</Badge>}
        </>
      }
      control={<Control entry={entry} value={value} disabled={disabled} onChange={onChange} />}
    />
  )
}
