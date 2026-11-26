import { useState } from 'react'
import { EyeOff, X } from 'lucide-react'
import { SOURCE_ORDER, isSettingsObject, keyPath, type SettingsLayer, type SourceLayer } from '../../../shared/claudeSettings'
import { LAYER_NAMES, layerList } from '../../../shared/claudeSettingsCatalog'
import type { LayerSettings } from '../../../shared/claudeSettingsEffective'
import { ENV_VAR_NAMES, MASK, acceptsValue, envRows, envVar, ignoredHere, isSecretName, retiredNote, toggleText, toggledOn, type EnvRow, type EnvVar } from '../../../shared/envCatalog'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { FormRow } from '../ui/FormRow'
import { IconButton } from '../ui/IconButton'
import { NoticeLine } from '../ui/NoticeLine'
import { TextField } from '../ui/TextField'

interface Props {
  /** The edited layer's `env`, with its waiting changes. */
  value: unknown
  /** Every layer with its waiting changes, for the values other layers set. */
  layers: LayerSettings
  layer: SettingsLayer
  disabled: boolean
  onStage: (key: string, value: unknown) => void
}

const HELP = 'Claude, and every command, hook and MCP server it starts, gets these variables. Values are saved as text.'

const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

const above = (a: SourceLayer, b: SourceLayer): boolean => SOURCE_ORDER.indexOf(a) < SOURCE_ORDER.indexOf(b)

/** Where the value that applies comes from, as seen from the edited layer. */
function sourceWords(row: EnvRow, edited: SettingsLayer): string | null {
  const source = row.effective?.layer
  if (!source) return null
  if (source === 'organisation') return 'Set by your organisation'
  return above(source, edited) ? `Overridden by ${LAYER_NAMES[source]}` : `From ${LAYER_NAMES[source]}`
}

interface ValueControlProps {
  name: string
  known: EnvVar | undefined
  value: string
  disabled: boolean
  /** Undefined removes the variable. */
  onChange: (value: string | undefined) => void
  /** Told whether the box holds text the variable doesn't take, which isn't saved. */
  onRefused: (refused: boolean) => void
}

/** On/off as a checkbox and numbers checked, for a variable the catalog describes; a text box for any other value. */
function ValueControl({ name, known, value, disabled, onChange, onRefused }: ValueControlProps) {
  const on = toggledOn(known, value)
  if (known && on !== undefined) {
    return (
      <Checkbox checked={on} disabled={disabled} onChange={(next) => onChange(toggleText(known, next))}>
        On
      </Checkbox>
    )
  }
  return (
    <TextField
      key={value}
      label={`Value of ${name}`}
      initialValue={value}
      placeholder={known?.placeholder ?? 'Value'}
      disabled={disabled}
      submitOnBlur
      keepOnSubmit
      onChange={() => onRefused(false)}
      onSubmit={(text) => {
        const takes = acceptsValue(known, text)
        onRefused(!takes)
        if (takes) onChange(text)
      }}
    />
  )
}

/** A secret's value as dots until it is clicked. */
function Masked({ name, onShow }: { name: string; onShow: () => void }) {
  return (
    <Button variant="link" label={`Show the value of ${name}`} tooltip="Show the value" onClick={onShow}>
      {MASK}
    </Button>
  )
}

interface VarRowProps {
  row: EnvRow
  layer: SettingsLayer
  disabled: boolean
  /** Read only when absent. */
  onChange?: (value: string | undefined) => void
}

function VarRow({ row, layer, disabled, onChange }: VarRowProps) {
  const [shown, setShown] = useState(false)
  const [refused, setRefused] = useState(false)
  const known = envVar(row.name)
  const secret = isSecretName(row.name)
  const hidden = secret && !shown
  const words = (value: string) => {
    if (hidden) return MASK
    const on = toggledOn(known, value)
    return on === undefined ? value : on ? 'on' : 'off'
  }
  const own = row.value
  const badge = sourceWords(row, layer)
  const locked = row.effective?.layer === 'organisation'
  const ignored = own === undefined ? null : ignoredHere(row.name, layer, own)
  const retired = retiredNote(row.name)
  const editable = onChange !== undefined && own !== undefined && !disabled && !locked
  return (
    <FormRow
      label={row.name}
      description={known?.description}
      notes={
        <>
          {badge && row.effective ? (
            <span>
              Applies: {words(row.effective.value)} <Badge tone={locked ? 'quiet-warning' : 'quiet'}>{badge}</Badge>
            </span>
          ) : (
            <span>Claude doesn’t use it here</span>
          )}
          {own === undefined && <Badge tone="quiet">Set in {layerList(row.others.map((o) => o.layer))}</Badge>}
          {ignored && <Badge tone="quiet-warning">{ignored}</Badge>}
          {retired && <Badge tone="quiet-warning">{retired}</Badge>}
          {refused && <Badge tone="quiet-warning">Not a number, so not taken</Badge>}
        </>
      }
      control={
        <>
          {hidden ? (
            <Masked name={row.name} onShow={() => setShown(true)} />
          ) : editable ? (
            <ValueControl name={row.name} known={known} value={own} disabled={disabled} onChange={onChange} onRefused={setRefused} />
          ) : (
            <span className="truncate text-muted">{own ?? row.others[0]?.value}</span>
          )}
          {secret && shown && (
            <IconButton label={`Hide the value of ${row.name}`} tooltip="Hide the value" onClick={() => setShown(false)}>
              <EyeOff size={12} />
            </IconButton>
          )}
          {editable && (
            <IconButton label={`Remove ${row.name}`} tooltip="Remove the variable from this layer" onClick={() => onChange(undefined)}>
              <X size={12} />
            </IconButton>
          )}
        </>
      }
    />
  )
}

function kindHint(known: EnvVar | undefined): string {
  if (!known) return 'Any name of letters, digits and _, and any text as its value.'
  if (known.kind === 'toggle') return `${known.description} Empty turns it on.`
  return known.kind === 'number' ? `${known.description} A number.` : known.description
}

function VarBuilder({ taken, disabled, onAdd }: { taken: readonly string[]; disabled: boolean; onAdd: (name: string, value: string) => void }) {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  // Remounts both boxes empty after an add.
  const [added, setAdded] = useState(0)
  const trimmed = name.trim()
  const known = envVar(trimmed)
  const valid = VALID_NAME.test(trimmed)
  const text = value.trim() === '' && known?.kind === 'toggle' ? toggleText(known, true) : value.trim()
  const ready = valid && text !== undefined && text !== '' && acceptsValue(known, text)
  const add = () => {
    if (!ready || text === undefined) return
    onAdd(trimmed, text)
    setName('')
    setValue('')
    setAdded(added + 1)
  }
  const retired = retiredNote(trimmed)
  return (
    <FormRow
      label="Add a variable"
      hint={valid ? trimmed : undefined}
      description={trimmed === '' ? 'Type a name: every variable Claude Code documents is offered as you type.' : valid ? kindHint(known) : 'A name holds only letters, digits and _, and doesn’t start with a digit.'}
      notes={
        <>
          {taken.includes(trimmed) && <span>This layer sets it already: Add replaces its value.</span>}
          {retired && <Badge tone="quiet-warning">{retired}</Badge>}
        </>
      }
      control={
        <Button variant="secondary" disabled={disabled || !ready} onClick={add}>
          Add
        </Button>
      }
    >
      <div key={added} className="flex gap-2">
        <TextField label="Name of the new variable" placeholder="Name, such as API_TIMEOUT_MS" disabled={disabled} suggestions={ENV_VAR_NAMES} keepOnSubmit onChange={setName} onSubmit={add} />
        <TextField label="Value of the new variable" placeholder={known?.placeholder ?? (known?.kind === 'toggle' ? 'Empty for on' : 'Value')} disabled={disabled} keepOnSubmit onChange={setValue} onSubmit={add} />
      </div>
    </FormRow>
  )
}

/** The edited layer's variables with the value that applies, the variables only other layers set, and a way to add one. */
export function EnvironmentEditor({ value, layers, layer, disabled, onStage }: Props) {
  const [othersOpen, setOthersOpen] = useState(false)
  if (value !== undefined && !isSettingsObject(value)) return <NoticeLine>The variables in this layer aren’t an object, so they show under Other keys as raw JSON.</NoticeLine>
  const rows = envRows(layer, layers)
  const own = rows.filter((r) => r.value !== undefined)
  const fromOthers = rows.filter((r) => r.value === undefined)
  const stageVar = (name: string, text: string | undefined) => onStage(keyPath('env', name), text)
  return (
    <div>
      <NoticeLine>{own.length === 0 ? `${HELP} No variables in this layer yet.` : HELP}</NoticeLine>
      {own.map((row) => (
        <VarRow key={row.name} row={row} layer={layer} disabled={disabled} onChange={(text) => stageVar(row.name, text)} />
      ))}
      {fromOthers.length > 0 && (
        <CollapsibleSection level="group" title={`From other layers (${fromOthers.length})`} open={othersOpen} onToggle={() => setOthersOpen(!othersOpen)}>
          {fromOthers.map((row) => (
            <VarRow key={row.name} row={row} layer={layer} disabled />
          ))}
        </CollapsibleSection>
      )}
      <VarBuilder taken={own.map((r) => r.name)} disabled={disabled} onAdd={stageVar} />
    </div>
  )
}
