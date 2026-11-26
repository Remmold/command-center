import { useMemo, useState } from 'react'
import { getAt, isSettingsObject, keyPath, type SettingsObject } from '../../../shared/claudeSettings'
import {
  KEYBINDING_ACTIONS,
  KEYBINDING_CONTEXTS,
  actionChanged,
  actionKeys,
  actionWords,
  addKeyEdits,
  bindingLabel,
  boundAction,
  keybindingAction,
  isUnnamedChord,
  otherBindings,
  otherTopKeys,
  reservedReason,
  resetEdits,
  normalBinding,
  unbindEdits,
  type ContextKeys,
  type KeyEdit,
  type KeybindingAction,
  type OtherBinding
} from '../../../shared/keybindings'
import { Badge } from '../ui/Badge'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { FormRow } from '../ui/FormRow'
import { KeyCaptureField } from '../ui/KeyCaptureField'
import { KeyChip } from '../ui/KeyChip'
import { NoticeLine } from '../ui/NoticeLine'
import { PageGroup } from '../ui/Page'
import { SearchField } from '../ui/SearchField'

interface Props {
  /** keybindings.json as the page reads it, each context's keys under `bindings`, with the waiting changes. */
  value: SettingsObject | null
  /** The file as on disk, so an entry Save takes out can be kept. */
  saved: SettingsObject | null
  disabled: boolean
  onStage: (key: string, value: unknown) => void
}

const contextKeys = (value: SettingsObject | null, context: string): ContextKeys | undefined => {
  const keys = getAt(value, keyPath('bindings', context))
  return isSettingsObject(keys) ? keys : undefined
}

function ActionRow({ entry, keys, disabled, onEdits }: { entry: KeybindingAction; keys: ContextKeys | undefined; disabled: boolean; onEdits: (edits: KeyEdit[]) => void }) {
  const [capturing, setCapturing] = useState(false)
  const shown = actionKeys(entry, keys)
  const changed = actionChanged(entry, keys)
  const taken = (binding: string): string | null => {
    const now = boundAction(entry.context, keys, binding)
    if (now === entry.action) return 'It already runs this.'
    return now ? `It runs ${actionWords(entry.context, now)} now; it moves here.` : null
  }
  return (
    <FormRow
      label={entry.label}
      hint={entry.action}
      notes={
        <>
          {shown.length === 0 && <span>No key</span>}
          {shown.map(({ binding }) => (
            <KeyChip
              key={binding}
              label={bindingLabel(binding)}
              removeLabel={`Unbind ${bindingLabel(binding)} from ${entry.label}`}
              onRemove={disabled || reservedReason(binding) ? undefined : () => onEdits(unbindEdits(entry, keys, binding))}
            />
          ))}
          {changed && <Badge tone="quiet">Built in: {entry.defaults.length > 0 ? entry.defaults.map(bindingLabel).join(', ') : 'no key'}</Badge>}
        </>
      }
      control={
        capturing ? (
          <KeyCaptureField
            label={`Keys for ${entry.label}`}
            problem={reservedReason}
            note={taken}
            onCapture={(binding) => {
              onEdits(addKeyEdits(entry, keys, binding))
              setCapturing(false)
            }}
            onCancel={() => setCapturing(false)}
          />
        ) : (
          <>
            {changed && (
              <Button variant="link" disabled={disabled} tooltip="Back to the built-in keys" onClick={() => onEdits(resetEdits(entry, keys))}>
                Reset
              </Button>
            )}
            <Button variant="secondary" disabled={disabled} label={`Add a key to ${entry.label}`} onClick={() => setCapturing(true)}>
              Add key
            </Button>
          </>
        )
      }
    />
  )
}

/** An entry of the file no action row shows. */
interface OtherRow {
  path: string
  label: string
  description: string
  value: unknown
  /** Not a context Claude Code lists. */
  unknownContext: boolean
}

function bindingRow({ context, key, value }: OtherBinding): OtherRow {
  const description = value === null ? (isUnnamedChord(context, key) ? 'Unbinds a built-in chord the docs give no action name.' : 'Unbinds the key, which runs nothing here by default.') : `Runs ${actionWords(context, value)}.`
  return { path: keyPath('bindings', context, key), label: `${context} · ${bindingLabel(key)}`, description, value, unknownContext: !KEYBINDING_CONTEXTS.some((c) => c.name === context) }
}

/** The file's entries no action row shows: bindings, then keys that aren't key bindings at all. */
function otherRows(file: SettingsObject | null): OtherRow[] {
  const top = otherTopKeys(file).map(([key, value]) => ({ path: keyPath(key), label: key, description: 'Not a key binding: Claude Code doesn’t read it here.', value, unknownContext: false }))
  return [...otherBindings(getAt(file, 'bindings')).map(bindingRow), ...top]
}

/** Each entry kept visible with its raw value; one Save takes out can be kept. */
function OtherBindingsList({ rows, disabled, onStage }: { rows: (OtherRow & { removed: boolean })[]; disabled: boolean; onStage: (key: string, value: unknown) => void }) {
  return (
    <PageGroup title="Other bindings">
      <NoticeLine>Entries this page has no action for: a command, a context or action it doesn’t know, a key without a built-in action, or a key that isn’t a binding.</NoticeLine>
      <div>
        {rows.map(({ path, label, description, value, unknownContext, removed }) => (
          <FormRow
            key={path}
            label={label}
            hint={JSON.stringify(value)}
            description={description}
            notes={
              <>
                {unknownContext && <Badge tone="quiet-warning">Claude Code doesn’t list this context</Badge>}
                {removed && <Badge tone="muted">Removed on Save</Badge>}
              </>
            }
            control={
              removed ? (
                <Button variant="link" disabled={disabled} tooltip="Keep it in the file" onClick={() => onStage(path, value)}>
                  Keep
                </Button>
              ) : (
                <Button variant="link" disabled={disabled} tooltip="Remove it from the file" onClick={() => onStage(path, undefined)}>
                  Remove
                </Button>
              )
            }
          />
        ))}
      </div>
    </PageGroup>
  )
}

/** By the action's words or name, its context, or a key that runs it, written either way (`ctrl+k` or `Ctrl+K`). */
function matches(entry: KeybindingAction, contextLabel: string, keys: ContextKeys | undefined, query: string): boolean {
  const words = query.trim().toLowerCase()
  if (!words) return true
  const asKey = normalBinding(words)
  return (
    [entry.label, entry.action, entry.context, contextLabel].some((text) => text.toLowerCase().includes(words)) ||
    actionKeys(entry, keys).some(({ binding }) => binding.includes(asKey) || bindingLabel(binding).toLowerCase().includes(words))
  )
}

/** Every action terminal Claude has, per context, with the keys that run it now; keys are set by pressing them. */
export function KeyBindingsEditor({ value, saved, disabled, onStage }: Props) {
  const [query, setQuery] = useState('')
  const onEdits = (edits: KeyEdit[]) => edits.forEach(({ path, value: next }) => onStage(path, next))
  const others = useMemo(() => {
    const now = otherRows(value)
    const paths = new Set(now.map((row) => row.path))
    return [...now.map((row) => ({ ...row, removed: false })), ...otherRows(saved).filter((row) => !paths.has(row.path)).map((row) => ({ ...row, removed: true }))]
  }, [value, saved])
  const groups = KEYBINDING_CONTEXTS.map((context) => {
    const keys = contextKeys(value, context.name)
    return {
      context,
      keys,
      entries: KEYBINDING_ACTIONS.filter((a) => a.context === context.name && matches(a, context.label, keys, query))
    }
  }).filter((group) => group.entries.length > 0)
  return (
    <>
      <Banner label="Key bindings change terminal Claude">These keys change Claude Code in a terminal, not this app’s shortcuts. Terminal Claude picks a change up without a restart.</Banner>
      <div className="w-72 max-w-full">
        <SearchField label="Find key bindings" placeholder="Find an action or key" value={query} onChange={setQuery} />
      </div>
      {groups.length === 0 && <NoticeLine>No action matches “{query.trim()}”.</NoticeLine>}
      {groups.map(({ context, keys, entries }) => (
        <PageGroup key={context.name} title={`${context.label} · ${context.name}`}>
          <div>
            {entries.map((entry) => (
              <ActionRow key={entry.action} entry={entry} keys={keys} disabled={disabled} onEdits={onEdits} />
            ))}
          </div>
        </PageGroup>
      ))}
      {others.length > 0 && <OtherBindingsList rows={others} disabled={disabled} onStage={onStage} />}
    </>
  )
}
