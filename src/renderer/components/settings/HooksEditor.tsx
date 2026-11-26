import { useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { isSettingsObject, type SettingsLayer } from '../../../shared/claudeSettings'
import { layerList } from '../../../shared/claudeSettingsCatalog'
import type { LayerSettings } from '../../../shared/claudeSettingsEffective'
import {
  HOOK_EVENTS,
  HOOK_FIELDS,
  HOOK_TYPES,
  addHook,
  changeHook,
  defaultTimeout,
  hookEvent,
  hookEventPath,
  hookSummary,
  isCommandCenterPermissionHook,
  matcherWords,
  otherLayerGroups,
  readHookEvents,
  requiredFields,
  retype,
  setMatcher,
  takesIf,
  typeLabel,
  type Hook,
  type HookEvent,
  type HookField,
  type HookGroup,
  type HookType
} from '../../../shared/hooks'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { FormRow } from '../ui/FormRow'
import { IconButton } from '../ui/IconButton'
import { JsonField } from '../ui/JsonField'
import { NoticeLine } from '../ui/NoticeLine'
import { Select } from '../ui/Select'
import { TextField } from '../ui/TextField'

interface Props {
  /** The edited layer's `hooks`, with its waiting changes. */
  value: unknown
  /** Every layer with its waiting changes, for the hooks other layers add. */
  layers: LayerSettings
  layer: SettingsLayer
  disabled: boolean
  onStage: (key: string, value: unknown) => void
  onUnparsed: (key: string, unparsed: boolean) => void
}

const NOT_SET = ''

const eventWords = (event: HookEvent | undefined): string | undefined =>
  event && (event.matcher ? `${event.description} A matcher filters on ${event.matcher.subject}, such as ${event.matcher.examples}.` : event.description)

const typeChoices = (event: HookEvent | undefined) => (event?.commandOnly ? HOOK_TYPES.filter((t) => t.value === 'command') : HOOK_TYPES)

const timeoutText = (hook: Hook, event: string): string =>
  typeof hook.timeout === 'number' ? `Time limit ${hook.timeout} s` : `Time limit ${defaultTimeout(hook.type as HookType, event)} s (default)`

/** The type's required fields as text boxes, for a new hook or a hook turned into another type. */
interface RequiredFieldsProps {
  type: HookType
  values: Record<string, string>
  disabled: boolean
  onChange: (values: Record<string, string>) => void
  /** Enter in a box. */
  onSubmit: () => void
}

function RequiredFields({ type, values, disabled, onChange, onSubmit }: RequiredFieldsProps) {
  return (
    <>
      {requiredFields(type).map((field) => (
        <TextField
          key={`${type}-${field.key}`}
          label={field.label}
          placeholder={field.placeholder ?? field.label}
          disabled={disabled}
          keepOnSubmit
          onSubmit={onSubmit}
          onChange={(text) => onChange({ ...values, [field.key]: text })}
        />
      ))}
    </>
  )
}

const filled = (type: HookType, values: Record<string, string>): boolean => requiredFields(type).every((f) => (values[f.key] ?? '').trim() !== '')

const trimmed = (values: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(values).map(([key, text]) => [key, text.trim()]))

function parseField(field: HookField, text: string): unknown {
  if (field.kind === 'number') {
    const n = Number(text)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  if (field.kind === 'list') return text.split(',').map((s) => s.trim()).filter(Boolean)
  return text
}

interface FieldControlProps {
  field: HookField
  value: unknown
  placeholder: string
  disabled: boolean
  onChange: (value: unknown) => void
  onUnparsed: (unparsed: boolean) => void
}

function FieldControl({ field, value, placeholder, disabled, onChange, onUnparsed }: FieldControlProps) {
  switch (field.kind) {
    case 'toggle':
      return (
        <Checkbox checked={value === true} disabled={disabled} onChange={(on) => onChange(on ? true : undefined)}>
          On
        </Checkbox>
      )
    case 'choice':
      return (
        <Select
          label={field.label}
          options={[{ value: NOT_SET, label: 'Not set' }, ...(field.options ?? [])]}
          value={typeof value === 'string' ? value : NOT_SET}
          disabled={disabled}
          onChange={(next) => onChange(next === NOT_SET ? undefined : next)}
        />
      )
    case 'object':
      return <JsonField label={field.label} value={value} disabled={disabled} onChange={(next) => isSettingsObject(next) && onChange(next)} onUnparsedChange={onUnparsed} />
    default: {
      const text = Array.isArray(value) ? value.join(', ') : value === undefined ? '' : String(value)
      return (
        <TextField
          key={text}
          label={field.label}
          initialValue={text}
          placeholder={placeholder}
          disabled={disabled}
          submitOnBlur
          keepOnSubmit
          onSubmit={(typed) => {
            const parsed = parseField(field, typed)
            if (parsed !== undefined) onChange(parsed)
          }}
        />
      )
    }
  }
}

interface HookRowProps {
  event: string
  hook: Hook
  /** Read only when absent. */
  onChange?: (hook: Hook | undefined) => void
  disabled: boolean
  /** Where the row's JSON boxes report text not yet taken. */
  unparsedKey: string
  onUnparsed: (key: string, unparsed: boolean) => void
  from?: string
}

/** One hook: what it runs, its type, time limit and message, and, opened, every field of its type and a way to turn it into another type. */
function HookRow({ event, hook, onChange, disabled, unparsedKey, onUnparsed, from }: HookRowProps) {
  const [open, setOpen] = useState(false)
  const [newType, setNewType] = useState<HookType | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const known = hookEvent(event)
  const type = hook.type as HookType
  const fields = HOOK_FIELDS[type]
  const editable = onChange !== undefined && !disabled
  const set = (key: string, value: unknown) => {
    const { [key]: _old, ...rest } = hook
    onChange?.({ ...rest, type: hook.type, ...(value === undefined ? {} : { [key]: value }) })
  }
  const others = typeChoices(known).filter((t) => t.value !== type)
  const change = () => {
    if (!newType || !filled(newType, values)) return
    onChange?.(retype(hook, newType, trimmed(values)))
    setNewType(null)
    setValues({})
  }
  return (
    <FormRow
      label={hookSummary(hook)}
      hint={`${typeLabel(type)} hook`}
      notes={
        <>
          <span>{timeoutText(hook, event)}</span>
          {typeof hook.statusMessage === 'string' && <span>Shows “{hook.statusMessage}”</span>}
          {hook.async === true && <span>In the background</span>}
          {typeof hook.if === 'string' && <span>Only for {hook.if}</span>}
          {typeof hook.if === 'string' && !takesIf(known) && <Badge tone="quiet-warning">Never runs here: its filter counts only on tool events</Badge>}
          {known?.commandOnly && type !== 'command' && <Badge tone="quiet-warning">This event runs only command hooks</Badge>}
          {isCommandCenterPermissionHook(hook) && <Badge tone="quiet">Command Center’s old permission hook: the app takes it out of this file when it starts</Badge>}
          {from && <Badge tone="quiet">From {from}</Badge>}
        </>
      }
      control={
        editable && (
          <>
            <IconButton label={`${open ? 'Close' : 'Edit'} ${hookSummary(hook)}`} tooltip={open ? 'Close the fields' : 'Edit every field'} onClick={() => setOpen(!open)}>
              <Pencil size={12} />
            </IconButton>
            <IconButton label={`Remove ${hookSummary(hook)}`} tooltip="Remove the hook from this layer" onClick={() => onChange(undefined)}>
              <X size={12} />
            </IconButton>
          </>
        )
      }
    >
      {open && editable && (
        <div>
          {fields.map((field) => (
            <FormRow
              key={field.key}
              label={field.label}
              hint={field.key}
              description={field.description}
              control={
                <>
                  <FieldControl
                    field={field}
                    value={hook[field.key]}
                    placeholder={field.key === 'timeout' ? `${defaultTimeout(type, event)} (default)` : (field.placeholder ?? 'Not set')}
                    disabled={disabled}
                    onChange={(value) => set(field.key, value)}
                    onUnparsed={(unparsed) => onUnparsed(`${unparsedKey}.${field.key}`, unparsed)}
                  />
                  {!field.required && hook[field.key] !== undefined && field.kind !== 'toggle' && (
                    <IconButton label={`Clear ${field.label}`} tooltip="Take it out of the hook" onClick={() => set(field.key, undefined)}>
                      <X size={12} />
                    </IconButton>
                  )}
                </>
              }
            />
          ))}
          {others.length > 0 && (
            <FormRow
              label="Turn into another type"
              description={newType ? HOOK_TYPES.find((t) => t.value === newType)?.description : 'Its message and filter stay; fill in what the new type needs.'}
              control={
                <>
                  <Select
                    label={`New type for ${hookSummary(hook)}`}
                    options={[{ value: NOT_SET, label: 'Type…' }, ...others]}
                    value={newType ?? NOT_SET}
                    onChange={(next) => {
                      setNewType(next === NOT_SET ? null : (next as HookType))
                      setValues({})
                    }}
                  />
                  <Button
                    variant="secondary"
                    disabled={!newType || !filled(newType, values)}
                    onClick={change}
                  >
                    Change
                  </Button>
                </>
              }
            >
              {newType && <RequiredFields type={newType} values={values} disabled={disabled} onChange={setValues} onSubmit={change} />}
            </FormRow>
          )}
        </div>
      )}
    </FormRow>
  )
}

function GroupRows({ event, group, onGroupChange, onHookChange, disabled, unparsedKey, onUnparsed, from }: {
  event: string
  group: HookGroup
  onGroupChange?: (matcher: string) => void
  onHookChange?: (index: number, hook: Hook | undefined) => void
  disabled: boolean
  unparsedKey: string
  onUnparsed: (key: string, unparsed: boolean) => void
  from?: string
}) {
  const known = hookEvent(event)
  const takesMatcher = known?.matcher !== null || group.matcher !== undefined
  return (
    <FormRow
      label={matcherWords(known, group.matcher)}
      hint={group.matcher === undefined ? undefined : `matcher: ${group.matcher}`}
      control={
        onGroupChange &&
        takesMatcher &&
        !disabled && (
          <TextField key={group.matcher ?? ''} label={`Matcher for ${known?.label ?? event}`} initialValue={group.matcher ?? ''} placeholder="* for every time" submitOnBlur keepOnSubmit onSubmit={onGroupChange} />
        )
      }
    >
      {group.hooks.map((hook, index) => (
        <HookRow
          key={`${index}:${hook.type}`}
          event={event}
          hook={hook}
          disabled={disabled}
          onChange={onHookChange && ((next) => onHookChange(index, next))}
          unparsedKey={`${unparsedKey}.${index}`}
          onUnparsed={onUnparsed}
          from={from}
        />
      ))}
    </FormRow>
  )
}

function HookBuilder({ hooks, disabled, onAdd }: { hooks: Record<string, HookGroup[]>; disabled: boolean; onAdd: (event: string, groups: HookGroup[]) => void }) {
  const [eventName, setEventName] = useState(HOOK_EVENTS[0].name)
  const [matcher, setMatcher] = useState('')
  const [type, setType] = useState<HookType>('command')
  const [values, setValues] = useState<Record<string, string>>({})
  // Bumped on each add, so the typed fields start empty again.
  const [added, setAdded] = useState(0)
  const event = hookEvent(eventName) ?? HOOK_EVENTS[0]
  const ready = filled(type, values)
  const add = () => {
    if (!ready) return
    onAdd(event.name, addHook(hooks[event.name], event.matcher ? matcher : '', { type, ...trimmed(values) }))
    setMatcher('')
    setValues({})
    setAdded(added + 1)
  }
  return (
    <FormRow
      label="Add a hook"
      hint={event.name}
      description={`${event.label}: ${eventWords(event)} ${HOOK_TYPES.find((t) => t.value === type)?.description ?? ''}`}
      control={
        <>
          <Select
            label="Event for a new hook"
            options={HOOK_EVENTS.map((e) => ({ value: e.name, label: e.label }))}
            value={event.name}
            disabled={disabled}
            onChange={(next) => {
              setEventName(next)
              if (hookEvent(next)?.commandOnly) setType('command')
            }}
          />
          <Button variant="secondary" disabled={disabled || !ready} onClick={add}>
            Add
          </Button>
        </>
      }
    >
      <div key={added}>
        <Select
          label="Type of the new hook"
          options={typeChoices(event)}
          value={type}
          disabled={disabled}
          onChange={(next) => {
            setType(next as HookType)
            setValues({})
          }}
        />
        {event.matcher && <TextField label="Matcher for the new hook" placeholder={`Empty for every time, or ${event.matcher.examples}`} disabled={disabled} keepOnSubmit onSubmit={add} onChange={setMatcher} />}
        <RequiredFields type={type} values={values} disabled={disabled} onChange={setValues} onSubmit={add} />
      </div>
    </FormRow>
  )
}

/** The edited layer's hooks per event, each group with its matcher and hooks, the hooks other layers add, and a way to add one. */
export function HooksEditor({ value, layers, layer, disabled, onStage, onUnparsed }: Props) {
  const [othersOpen, setOthersOpen] = useState(false)
  if (value !== undefined && !isSettingsObject(value)) return <NoticeLine>The hooks in this layer aren’t an object, so they show under Other keys as raw JSON.</NoticeLine>
  const events = readHookEvents(value)
  const byEvent = Object.fromEntries(events.map((e) => [e.event, e.groups]))
  const fromOthers = otherLayerGroups(layer, layers)
  const stageEvent = (event: string, groups: HookGroup[] | undefined) => onStage(hookEventPath(event), groups)
  return (
    <div>
      {events.length === 0 && <NoticeLine>No hooks in this layer.</NoticeLine>}
      {events.map(({ event, groups }) => {
        const known = hookEvent(event)
        return (
          <FormRow key={event} label={known?.label ?? event} hint={event} description={eventWords(known)} control={null}>
            {groups.map((group, g) => (
              <GroupRows
                key={g}
                event={event}
                group={group}
                disabled={disabled}
                onGroupChange={(matcher) => stageEvent(event, setMatcher(groups, g, matcher))}
                onHookChange={(index, hook) => stageEvent(event, changeHook(groups, g, index, hook))}
                unparsedKey={`${hookEventPath(event)}.${g}`}
                onUnparsed={onUnparsed}
              />
            ))}
          </FormRow>
        )
      })}
      {fromOthers.length > 0 && (
        <CollapsibleSection level="group" title={`From other layers (${fromOthers.length})`} open={othersOpen} onToggle={() => setOthersOpen(!othersOpen)}>
          {fromOthers.map(({ event, group, layers: from }, i) => (
            <FormRow key={i} label={hookEvent(event)?.label ?? event} hint={event} control={null}>
              <GroupRows event={event} group={group} disabled unparsedKey="" onUnparsed={onUnparsed} from={layerList(from)} />
            </FormRow>
          ))}
        </CollapsibleSection>
      )}
      <HookBuilder hooks={byEvent} disabled={disabled} onAdd={stageEvent} />
    </div>
  )
}
